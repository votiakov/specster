/**
 * State Manager for Specster MCP Server
 * Handles state persistence and management across workflow phases
 */

import { Logger } from './logger.js';
import { WorkflowPhase } from './workflow-engine.js';
import { Phase, SpecificationState, WorkflowEvent, PhaseInfo } from '../types/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface StateManagerConfig {
  persistenceEnabled: boolean;
  storageType: 'memory' | 'file' | 'database';
  storagePath?: string;
  autoSave?: boolean;
  saveInterval?: number;
  cacheExpiration?: number;
}

interface StateCache {
  data: any; // Can hold either ProjectState or SpecificationState
  timestamp: number;
  expiresAt: number;
}

interface StateLock {
  specName: string;
  timestamp: number;
  processId: string;
}

export interface ProjectState {
  projectId: string;
  currentPhase: WorkflowPhase;
  phaseData: Record<WorkflowPhase, Record<string, any>>;
  metadata: ProjectMetadata;
  timestamps: Record<string, Date>;
  version: number;
}

// Extended to support specification states
export interface ExtendedProjectState extends ProjectState {
  specificationState?: SpecificationState;
}

export interface ProjectMetadata {
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  settings: Record<string, any>;
}

export interface StateSnapshot {
  projectId: string;
  phase: WorkflowPhase;
  data: Record<string, any>;
  timestamp: Date;
  version: number;
}

export interface StateQuery {
  projectId?: string;
  phase?: WorkflowPhase;
  fromDate?: Date;
  toDate?: Date;
  tags?: string[];
}

/**
 * State Manager handles persistence and retrieval of project state
 */
export class StateManager {
  private config: StateManagerConfig;
  private logger: Logger;
  private states: Map<string, ProjectState> = new Map();
  private snapshots: Map<string, StateSnapshot[]> = new Map();
  private saveTimer?: NodeJS.Timeout;
  private stateCache: Map<string, StateCache> = new Map();
  private locks: Map<string, StateLock> = new Map();
  private specificationStates: Map<string, SpecificationState> = new Map();
  private workflowHistory: Map<string, WorkflowEvent[]> = new Map();

  /**
   * Creates a new StateManager instance
   * @param config - State manager configuration
   * @param logger - Logger instance for structured logging
   */
  constructor(config: StateManagerConfig, logger: Logger) {
    this.config = {
      autoSave: true,
      saveInterval: 30000, // 30 seconds
      cacheExpiration: 300000, // 5 minutes
      storagePath: '.specster/state',
      ...config
    };
    this.logger = logger;
    
    if (this.config.autoSave) {
      this.startAutoSave();
    }
    
    // Initialize state directory if using file storage
    if (this.config.storageType === 'file') {
      this.ensureStateDirectory();
    }
  }

  /**
   * Initializes state for a new project
   * @param projectId - Project identifier
   * @param metadata - Project metadata
   * @returns Promise resolving to initial project state
   */
  async initializeProject(projectId: string, metadata: ProjectMetadata): Promise<ProjectState> {
    this.logger.info(`Initializing state for project ${projectId}`);

    const state: ProjectState = {
      projectId,
      currentPhase: WorkflowPhase.REQUIREMENTS,
      phaseData: {
        [WorkflowPhase.REQUIREMENTS]: {},
        [WorkflowPhase.DESIGN]: {},
        [WorkflowPhase.IMPLEMENTATION]: {},
        [WorkflowPhase.TESTING]: {},
        [WorkflowPhase.DEPLOYMENT]: {}
      },
      metadata: {
        ...metadata,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      timestamps: {
        created: new Date(),
        lastUpdated: new Date()
      },
      version: 1
    };

    this.states.set(projectId, state);
    this.snapshots.set(projectId, []);

    if (this.config.persistenceEnabled) {
      await this.persistState(projectId);
    }

    return state;
  }

  /**
   * Gets the current state for a project
   * @param projectId - Project identifier
   * @returns Current project state or null if not found
   */
  async getProjectState(projectId: string): Promise<ProjectState | null> {
    const state = this.states.get(projectId);
    if (state) {
      return state;
    }

    // Try to load from persistence
    if (this.config.persistenceEnabled) {
      return await this.loadState(projectId);
    }

    return null;
  }

  /**
   * Updates state for a specific phase
   * @param projectId - Project identifier
   * @param phase - Workflow phase
   * @param data - Phase data to update
   * @returns Promise resolving to success status
   */
  async updatePhaseState(projectId: string, phase: WorkflowPhase, data: Record<string, any>): Promise<boolean> {
    const state = this.states.get(projectId);
    if (!state) {
      this.logger.error(`Project ${projectId} not found`);
      return false;
    }

    this.logger.debug(`Updating ${phase} state for project ${projectId}`);

    // Update phase data
    state.phaseData[phase] = { ...state.phaseData[phase], ...data };
    state.timestamps.lastUpdated = new Date();
    state.metadata.updatedAt = new Date();
    state.version++;

    // Create snapshot
    await this.createSnapshot(projectId, phase, data);

    if (this.config.persistenceEnabled) {
      await this.persistState(projectId);
    }

    return true;
  }

  /**
   * Transitions project to a new phase
   * @param projectId - Project identifier
   * @param newPhase - Target phase
   * @returns Promise resolving to success status
   */
  async transitionPhase(projectId: string, newPhase: WorkflowPhase): Promise<boolean> {
    const state = this.states.get(projectId);
    if (!state) {
      this.logger.error(`Project ${projectId} not found`);
      return false;
    }

    this.logger.info(`Transitioning project ${projectId} to phase ${newPhase}`);

    const previousPhase = state.currentPhase;
    state.currentPhase = newPhase;
    state.timestamps.lastUpdated = new Date();
    state.metadata.updatedAt = new Date();
    state.version++;

    // Record phase transition
    state.timestamps[`${newPhase}_started`] = new Date();
    if (previousPhase) {
      state.timestamps[`${previousPhase}_completed`] = new Date();
    }

    if (this.config.persistenceEnabled) {
      await this.persistState(projectId);
    }

    return true;
  }

  /**
   * Creates a snapshot of the current state
   * @param projectId - Project identifier
   * @param phase - Current phase
   * @param data - Phase data
   * @returns Promise resolving to created snapshot
   */
  async createSnapshot(projectId: string, phase: WorkflowPhase, data: Record<string, any>): Promise<StateSnapshot> {
    const state = this.states.get(projectId);
    if (!state) {
      throw new Error(`Project ${projectId} not found`);
    }

    const snapshot: StateSnapshot = {
      projectId,
      phase,
      data: JSON.parse(JSON.stringify(data)), // Deep copy
      timestamp: new Date(),
      version: state.version
    };

    const projectSnapshots = this.snapshots.get(projectId) || [];
    projectSnapshots.push(snapshot);
    this.snapshots.set(projectId, projectSnapshots);

    this.logger.debug(`Created snapshot for project ${projectId} at phase ${phase}`);
    return snapshot;
  }

  /**
   * Gets snapshots for a project
   * @param projectId - Project identifier
   * @param phase - Optional phase filter
   * @returns Array of snapshots
   */
  async getSnapshots(projectId: string, phase?: WorkflowPhase): Promise<StateSnapshot[]> {
    const snapshots = this.snapshots.get(projectId) || [];
    
    if (phase) {
      return snapshots.filter(snapshot => snapshot.phase === phase);
    }
    
    return snapshots;
  }

  /**
   * Searches for projects based on query criteria
   * @param query - Search query
   * @returns Array of matching project states
   */
  async searchProjects(query: StateQuery): Promise<ProjectState[]> {
    const results: ProjectState[] = [];

    for (const state of this.states.values()) {
      if (this.matchesQuery(state, query)) {
        results.push(state);
      }
    }

    return results;
  }

  /**
   * Deletes a project and all its state
   * @param projectId - Project identifier
   * @returns Promise resolving to success status
   */
  async deleteProject(projectId: string): Promise<boolean> {
    this.logger.info(`Deleting project ${projectId}`);

    const existed = this.states.delete(projectId);
    this.snapshots.delete(projectId);

    if (existed && this.config.persistenceEnabled) {
      await this.removePersistedState(projectId);
    }

    return existed;
  }

  /**
   * Checks if a project state matches the query
   * @param state - Project state to check
   * @param query - Query criteria
   * @returns Whether state matches query
   */
  private matchesQuery(state: ProjectState, query: StateQuery): boolean {
    if (query.projectId && state.projectId !== query.projectId) {
      return false;
    }

    if (query.phase && state.currentPhase !== query.phase) {
      return false;
    }

    if (query.fromDate && state.metadata.createdAt < query.fromDate) {
      return false;
    }

    if (query.toDate && state.metadata.createdAt > query.toDate) {
      return false;
    }

    if (query.tags && query.tags.length > 0) {
      const hasMatchingTag = query.tags.some(tag => 
        state.metadata.tags.includes(tag)
      );
      if (!hasMatchingTag) {
        return false;
      }
    }

    return true;
  }

  /**
   * Persists state to storage
   * @param projectId - Project identifier
   * @returns Promise resolving when persistence is complete
   */
  private async persistState(projectId: string): Promise<void> {
    const state = this.states.get(projectId);
    if (!state) {
      return;
    }

    try {
      await this.acquireLock(projectId);
      
      switch (this.config.storageType) {
        case 'file':
          await this.persistToFile(projectId, state);
          break;
        case 'database':
          await this.persistToDatabase(projectId, state);
          break;
        case 'memory':
          // Already in memory, no action needed
          break;
      }
      
      // Update cache
      this.updateCache(projectId, state);
    } finally {
      this.releaseLock(projectId);
    }
  }

  /**
   * Loads state from storage
   * @param projectId - Project identifier
   * @returns Promise resolving to loaded state or null
   */
  private async loadState(projectId: string): Promise<ProjectState | null> {
    // Check cache first
    const cached = this.getFromCache(projectId);
    if (cached) {
      return cached;
    }

    try {
      await this.acquireLock(projectId);
      
      let state: ProjectState | null = null;
      
      switch (this.config.storageType) {
        case 'file':
          state = await this.loadFromFile(projectId);
          break;
        case 'database':
          state = await this.loadFromDatabase(projectId);
          break;
        case 'memory':
          return null; // Memory storage doesn't persist across restarts
      }
      
      if (state) {
        this.states.set(projectId, state);
        this.updateCache(projectId, state);
      }
      
      return state;
    } finally {
      this.releaseLock(projectId);
    }
  }

  /**
   * Removes persisted state
   * @param projectId - Project identifier
   * @returns Promise resolving when removal is complete
   */
  private async removePersistedState(projectId: string): Promise<void> {
    try {
      await this.acquireLock(projectId);
      
      switch (this.config.storageType) {
        case 'file':
          const filePath = this.getStateFilePath(projectId);
          await fs.unlink(filePath);
          this.logger.debug(`State file removed: ${filePath}`);
          break;
        case 'database':
          // TODO: Implement database removal
          break;
        case 'memory':
          // No persistent storage to remove
          break;
      }
      
      // Remove from cache
      this.stateCache.delete(projectId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    } finally {
      this.releaseLock(projectId);
    }
  }

  /**
   * Persists state to file
   * @param projectId - Project identifier
   * @param state - Project state
   * @returns Promise resolving when persistence is complete
   */
  private async persistToFile(projectId: string, state: ProjectState): Promise<void> {
    const filePath = this.getStateFilePath(projectId);
    const stateData = {
      ...state,
      timestamps: this.serializeTimestamps(state.timestamps),
      metadata: {
        ...state.metadata,
        createdAt: state.metadata.createdAt.toISOString(),
        updatedAt: state.metadata.updatedAt.toISOString()
      }
    };
    
    await fs.writeFile(filePath, JSON.stringify(stateData, null, 2), 'utf8');
    this.logger.debug(`State persisted to file: ${filePath}`);
  }

  /**
   * Loads state from file
   * @param projectId - Project identifier
   * @returns Promise resolving to loaded state or null
   */
  private async loadFromFile(projectId: string): Promise<ProjectState | null> {
    const filePath = this.getStateFilePath(projectId);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const stateData = JSON.parse(content);
      
      // Deserialize timestamps
      const state: ProjectState = {
        ...stateData,
        timestamps: this.deserializeTimestamps(stateData.timestamps),
        metadata: {
          ...stateData.metadata,
          createdAt: new Date(stateData.metadata.createdAt),
          updatedAt: new Date(stateData.metadata.updatedAt)
        }
      };
      
      this.logger.debug(`State loaded from file: ${filePath}`);
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.debug(`State file not found: ${filePath}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Persists state to database
   * @param projectId - Project identifier
   * @param state - Project state
   * @returns Promise resolving when persistence is complete
   */
  private async persistToDatabase(projectId: string, state: ProjectState): Promise<void> {
    // TODO: Implement database persistence
  }

  /**
   * Loads state from database
   * @param projectId - Project identifier
   * @returns Promise resolving to loaded state or null
   */
  private async loadFromDatabase(projectId: string): Promise<ProjectState | null> {
    // TODO: Implement database loading
    return null;
  }

  /**
   * Starts auto-save timer
   */
  private startAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }

    this.saveTimer = setInterval(async () => {
      await this.saveAllStates();
    }, this.config.saveInterval);
  }

  /**
   * Saves all states to persistence
   * @returns Promise resolving when all states are saved
   */
  private async saveAllStates(): Promise<void> {
    if (!this.config.persistenceEnabled) {
      return;
    }

    const savePromises = Array.from(this.states.keys()).map(projectId => 
      this.persistState(projectId)
    );

    await Promise.all(savePromises);
  }

  /**
   * Stops auto-save timer
   */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = undefined;
    }
  }

  /**
   * Cleanup method to stop timers and clear resources
   */
  async cleanup(): Promise<void> {
    this.stopAutoSave();
    this.clearExpiredCache();
    this.locks.clear();
    
    // Save any pending state changes
    if (this.config.persistenceEnabled) {
      await this.saveAllStates();
    }
  }

  /**
   * Gets all project IDs
   * @returns Array of project identifiers
   */
  getAllProjectIds(): string[] {
    return Array.from(this.states.keys());
  }

  // === Specification State Management ===

  /**
   * Initializes specification state for a project
   * @param specName - Specification name
   * @param metadata - Specification metadata
   * @returns Promise resolving to initial specification state
   */
  async initializeSpecificationState(specName: string, metadata: Partial<SpecificationState['metadata']>): Promise<SpecificationState> {
    const state: SpecificationState = {
      metadata: {
        name: specName,
        description: metadata.description || '',
        version: '1.0.0',
        createdAt: new Date(),
        lastModified: new Date(),
        author: metadata.author || 'unknown',
        ...metadata
      },
      workflow: {
        currentPhase: Phase.INIT,
        phases: {
          requirements: { status: 'pending' },
          design: { status: 'pending' },
          tasks: { status: 'pending' }
        },
        approvals: []
      },
      files: {
        requirements: { path: '', lastModified: new Date(), size: 0, exists: false },
        design: { path: '', lastModified: new Date(), size: 0, exists: false },
        tasks: { path: '', lastModified: new Date(), size: 0, exists: false }
      }
    };

    this.specificationStates.set(specName, state);
    await this.persistSpecificationState(specName, state);
    return state;
  }

  /**
   * Gets specification state
   * @param specName - Specification name
   * @returns Promise resolving to specification state or null
   */
  async getSpecificationState(specName: string): Promise<SpecificationState | null> {
    let state = this.specificationStates.get(specName);
    if (!state) {
      const loadedState = await this.loadSpecificationState(specName);
      if (loadedState) {
        state = loadedState;
        this.specificationStates.set(specName, state);
      }
    }
    return state || null;
  }

  /**
   * Updates specification state
   * @param specName - Specification name
   * @param updates - Partial state updates
   * @returns Promise resolving to success status
   */
  async updateSpecificationState(specName: string, updates: Partial<SpecificationState>): Promise<boolean> {
    const state = await this.getSpecificationState(specName);
    if (!state) {
      return false;
    }

    const updatedState = {
      ...state,
      ...updates,
      metadata: {
        ...state.metadata,
        ...updates.metadata,
        lastModified: new Date()
      }
    };

    this.specificationStates.set(specName, updatedState);
    await this.persistSpecificationState(specName, updatedState);
    return true;
  }

  /**
   * Transitions specification to a new phase
   * @param specName - Specification name
   * @param newPhase - Target phase
   * @param approvedBy - Who approved the transition
   * @returns Promise resolving to success status
   */
  async transitionSpecificationPhase(specName: string, newPhase: Phase, approvedBy?: string): Promise<boolean> {
    const state = await this.getSpecificationState(specName);
    if (!state) {
      return false;
    }

    const now = new Date();
    const currentPhase = state.workflow.currentPhase;

    // Update phase info
    if (currentPhase !== Phase.INIT) {
      const currentPhaseKey = this.getPhaseKey(currentPhase);
      if (currentPhaseKey) {
        state.workflow.phases[currentPhaseKey].status = 'completed';
        state.workflow.phases[currentPhaseKey].completedAt = now;
      }
    }

    const newPhaseKey = this.getPhaseKey(newPhase);
    if (newPhaseKey) {
      state.workflow.phases[newPhaseKey].status = 'in_progress';
      state.workflow.phases[newPhaseKey].startedAt = now;
      
      if (approvedBy) {
        state.workflow.phases[newPhaseKey].approvedBy = approvedBy;
        state.workflow.phases[newPhaseKey].approvalTimestamp = now;
      }
    }

    state.workflow.currentPhase = newPhase;
    state.metadata.lastModified = now;

    // Add approval record
    if (approvedBy) {
      state.workflow.approvals.push({
        phase: newPhase,
        approvedBy,
        timestamp: now
      });
    }

    // Record workflow event
    await this.recordWorkflowEvent(specName, {
      id: `${specName}-${Date.now()}`,
      timestamp: now,
      specName,
      phase: newPhase,
      action: 'phase_transition',
      details: { from: currentPhase, to: newPhase, approvedBy },
      userId: approvedBy
    });

    this.specificationStates.set(specName, state);
    await this.persistSpecificationState(specName, state);
    return true;
  }

  /**
   * Records a workflow event
   * @param specName - Specification name
   * @param event - Workflow event
   * @returns Promise resolving when event is recorded
   */
  async recordWorkflowEvent(specName: string, event: WorkflowEvent): Promise<void> {
    const events = this.workflowHistory.get(specName) || [];
    events.push(event);
    this.workflowHistory.set(specName, events);
    
    // Persist workflow history
    await this.persistWorkflowHistory(specName, events);
  }

  /**
   * Gets workflow history for a specification
   * @param specName - Specification name
   * @returns Array of workflow events
   */
  async getWorkflowHistory(specName: string): Promise<WorkflowEvent[]> {
    let history = this.workflowHistory.get(specName);
    if (!history) {
      history = await this.loadWorkflowHistory(specName);
    }
    return history || [];
  }

  // === Cache Management ===

  /**
   * Updates cache for a project
   * @param projectId - Project identifier
   * @param state - Project state
   */
  private updateCache(projectId: string, state: ProjectState): void {
    const now = Date.now();
    this.stateCache.set(projectId, {
      data: state as any, // Type compatibility
      timestamp: now,
      expiresAt: now + (this.config.cacheExpiration || 300000)
    });
  }

  /**
   * Gets state from cache if not expired
   * @param projectId - Project identifier
   * @returns Cached state or null
   */
  private getFromCache(projectId: string): ProjectState | null {
    const cached = this.stateCache.get(projectId);
    if (!cached) {
      return null;
    }

    if (Date.now() > cached.expiresAt) {
      this.stateCache.delete(projectId);
      return null;
    }

    return cached.data;
  }

  /**
   * Clears expired cache entries
   */
  private clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, cache] of this.stateCache.entries()) {
      if (now > cache.expiresAt) {
        this.stateCache.delete(key);
      }
    }
  }

  // === Locking Mechanism ===

  /**
   * Acquires a lock for a project
   * @param projectId - Project identifier
   * @returns Promise resolving when lock is acquired
   */
  private async acquireLock(projectId: string): Promise<void> {
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 100; // 100ms
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const existingLock = this.locks.get(projectId);
      if (!existingLock || Date.now() - existingLock.timestamp > 30000) {
        // Lock is available or expired
        this.locks.set(projectId, {
          specName: projectId,
          timestamp: Date.now(),
          processId: process.pid.toString()
        });
        return;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    throw new Error(`Could not acquire lock for project ${projectId}`);
  }

  /**
   * Releases a lock for a project
   * @param projectId - Project identifier
   */
  private releaseLock(projectId: string): void {
    this.locks.delete(projectId);
  }

  // === Helper Methods ===

  /**
   * Ensures state directory exists
   */
  private async ensureStateDirectory(): Promise<void> {
    const stateDir = this.config.storagePath || '.specster/state';
    try {
      await fs.mkdir(stateDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create state directory', error as Error);
    }
  }

  /**
   * Gets file path for project state
   * @param projectId - Project identifier
   * @returns File path
   */
  private getStateFilePath(projectId: string): string {
    const stateDir = this.config.storagePath || '.specster/state';
    return path.join(stateDir, `${projectId}.json`);
  }

  /**
   * Gets file path for specification state
   * @param specName - Specification name
   * @returns File path
   */
  private getSpecificationStateFilePath(specName: string): string {
    const stateDir = this.config.storagePath || '.specster/state';
    return path.join(stateDir, `spec-${specName}.json`);
  }

  /**
   * Gets file path for workflow history
   * @param specName - Specification name
   * @returns File path
   */
  private getWorkflowHistoryFilePath(specName: string): string {
    const stateDir = this.config.storagePath || '.specster/state';
    return path.join(stateDir, `history-${specName}.json`);
  }

  /**
   * Serializes timestamps for JSON storage
   * @param timestamps - Timestamps object
   * @returns Serialized timestamps
   */
  private serializeTimestamps(timestamps: Record<string, Date>): Record<string, string> {
    const serialized: Record<string, string> = {};
    for (const [key, date] of Object.entries(timestamps)) {
      serialized[key] = date.toISOString();
    }
    return serialized;
  }

  /**
   * Deserializes timestamps from JSON storage
   * @param timestamps - Serialized timestamps
   * @returns Deserialized timestamps
   */
  private deserializeTimestamps(timestamps: Record<string, string>): Record<string, Date> {
    const deserialized: Record<string, Date> = {};
    for (const [key, dateString] of Object.entries(timestamps)) {
      deserialized[key] = new Date(dateString);
    }
    return deserialized;
  }

  /**
   * Gets phase key for workflow phases
   * @param phase - Phase enum
   * @returns Phase key or null
   */
  private getPhaseKey(phase: Phase): 'requirements' | 'design' | 'tasks' | null {
    switch (phase) {
      case Phase.REQUIREMENTS:
        return 'requirements';
      case Phase.DESIGN:
        return 'design';
      case Phase.TASKS:
        return 'tasks';
      default:
        return null;
    }
  }

  /**
   * Persists specification state to storage
   * @param specName - Specification name
   * @param state - Specification state
   */
  private async persistSpecificationState(specName: string, state: SpecificationState): Promise<void> {
    if (this.config.storageType === 'file') {
      const filePath = this.getSpecificationStateFilePath(specName);
      const stateData = {
        ...state,
        metadata: {
          ...state.metadata,
          createdAt: state.metadata.createdAt.toISOString(),
          lastModified: state.metadata.lastModified.toISOString()
        },
        workflow: {
          ...state.workflow,
          phases: this.serializePhaseInfo(state.workflow.phases),
          approvals: state.workflow.approvals.map(approval => ({
            ...approval,
            timestamp: approval.timestamp.toISOString()
          }))
        },
        files: this.serializeFileInfo(state.files)
      };
      
      await fs.writeFile(filePath, JSON.stringify(stateData, null, 2), 'utf8');
    }
  }

  /**
   * Loads specification state from storage
   * @param specName - Specification name
   * @returns Promise resolving to specification state or null
   */
  private async loadSpecificationState(specName: string): Promise<SpecificationState | null> {
    if (this.config.storageType === 'file') {
      const filePath = this.getSpecificationStateFilePath(specName);
      
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const stateData = JSON.parse(content);
        
        const state: SpecificationState = {
          ...stateData,
          metadata: {
            ...stateData.metadata,
            createdAt: new Date(stateData.metadata.createdAt),
            lastModified: new Date(stateData.metadata.lastModified)
          },
          workflow: {
            ...stateData.workflow,
            phases: this.deserializePhaseInfo(stateData.workflow.phases),
            approvals: stateData.workflow.approvals.map((approval: any) => ({
              ...approval,
              timestamp: new Date(approval.timestamp)
            }))
          },
          files: this.deserializeFileInfo(stateData.files)
        };
        
        this.specificationStates.set(specName, state);
        return state;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    }
    return null;
  }

  /**
   * Persists workflow history to storage
   * @param specName - Specification name
   * @param events - Workflow events
   */
  private async persistWorkflowHistory(specName: string, events: WorkflowEvent[]): Promise<void> {
    if (this.config.storageType === 'file') {
      const filePath = this.getWorkflowHistoryFilePath(specName);
      const serializedEvents = events.map(event => ({
        ...event,
        timestamp: event.timestamp.toISOString()
      }));
      
      await fs.writeFile(filePath, JSON.stringify(serializedEvents, null, 2), 'utf8');
    }
  }

  /**
   * Loads workflow history from storage
   * @param specName - Specification name
   * @returns Promise resolving to workflow events
   */
  private async loadWorkflowHistory(specName: string): Promise<WorkflowEvent[]> {
    if (this.config.storageType === 'file') {
      const filePath = this.getWorkflowHistoryFilePath(specName);
      
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const eventsData = JSON.parse(content);
        
        const events: WorkflowEvent[] = eventsData.map((event: any) => ({
          ...event,
          timestamp: new Date(event.timestamp)
        }));
        
        this.workflowHistory.set(specName, events);
        return events;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    }
    return [];
  }

  /**
   * Serializes phase info for JSON storage
   * @param phases - Phase info object
   * @returns Serialized phase info
   */
  private serializePhaseInfo(phases: Record<string, PhaseInfo>): Record<string, any> {
    const serialized: Record<string, any> = {};
    for (const [key, phase] of Object.entries(phases)) {
      serialized[key] = {
        ...phase,
        startedAt: phase.startedAt?.toISOString(),
        completedAt: phase.completedAt?.toISOString(),
        approvalTimestamp: phase.approvalTimestamp?.toISOString()
      };
    }
    return serialized;
  }

  /**
   * Deserializes phase info from JSON storage
   * @param phases - Serialized phase info
   * @returns Deserialized phase info
   */
  private deserializePhaseInfo(phases: Record<string, any>): Record<string, PhaseInfo> {
    const deserialized: Record<string, PhaseInfo> = {};
    for (const [key, phase] of Object.entries(phases)) {
      deserialized[key] = {
        ...phase,
        startedAt: phase.startedAt ? new Date(phase.startedAt) : undefined,
        completedAt: phase.completedAt ? new Date(phase.completedAt) : undefined,
        approvalTimestamp: phase.approvalTimestamp ? new Date(phase.approvalTimestamp) : undefined
      };
    }
    return deserialized;
  }

  /**
   * Serializes file info for JSON storage
   * @param files - File info object
   * @returns Serialized file info
   */
  private serializeFileInfo(files: Record<string, any>): Record<string, any> {
    const serialized: Record<string, any> = {};
    for (const [key, file] of Object.entries(files)) {
      serialized[key] = {
        ...file,
        lastModified: file.lastModified?.toISOString()
      };
    }
    return serialized;
  }

  /**
   * Deserializes file info from JSON storage
   * @param files - Serialized file info
   * @returns Deserialized file info
   */
  private deserializeFileInfo(files: Record<string, any>): Record<string, any> {
    const deserialized: Record<string, any> = {};
    for (const [key, file] of Object.entries(files)) {
      deserialized[key] = {
        ...file,
        lastModified: file.lastModified ? new Date(file.lastModified) : new Date()
      };
    }
    return deserialized;
  }
}