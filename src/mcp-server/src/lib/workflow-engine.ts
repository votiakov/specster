/**
 * Workflow Engine for Specster MCP Server
 * Manages workflow execution and phase transitions
 */

import { Logger } from './logger.js';
import { Phase, WorkflowEvent, ApprovalInfo } from '../types/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export enum WorkflowPhase {
  REQUIREMENTS = 'requirements',
  DESIGN = 'design',
  IMPLEMENTATION = 'implementation',
  TESTING = 'testing',
  DEPLOYMENT = 'deployment'
}

export enum WorkflowStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface WorkflowConfig {
  phases: WorkflowPhase[];
  autoTransition?: boolean;
  timeout?: number;
  rulesPath?: string;
  enableApprovalWorkflow?: boolean;
  defaultApprover?: string;
  requireExplicitApproval?: boolean;
  approvalTimeout?: number;
  baseDirectory?: string;
}

export interface PhaseDefinition {
  phase: WorkflowPhase;
  name: string;
  description: string;
  dependencies?: WorkflowPhase[];
  estimatedDuration?: number;
}

export interface WorkflowContext {
  projectId: string;
  workflowId: string;
  currentPhase: WorkflowPhase;
  data: Record<string, any>;
  history: PhaseTransition[];
  pendingApproval?: ApprovalRequest;
  approvalHistory: ApprovalRecord[];
}

export interface ApprovalRequest {
  id: string;
  specName: string;
  fromPhase: Phase;
  toPhase: Phase;
  requestedBy: string;
  requestedAt: Date;
  content: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt?: Date;
}

export interface ApprovalRecord {
  id: string;
  specName: string;
  phase: Phase;
  action: 'approved' | 'rejected';
  approvedBy: string;
  approvedAt: Date;
  comments?: string;
  content?: string;
}

export interface PhaseTransition {
  fromPhase: WorkflowPhase | null;
  toPhase: WorkflowPhase;
  timestamp: Date;
  reason?: string;
  data?: Record<string, any>;
}

export interface WorkflowResult {
  success: boolean;
  phase: WorkflowPhase;
  data?: Record<string, any>;
  error?: string;
}

// Workflow rules configuration
export interface WorkflowRules {
  phaseTransitions: Record<Phase, Phase[]>;
  approvalRequired: Phase[];
  autoTransition: boolean;
  validators: Record<Phase, string[]>;
}

// Phase transition validation result
export interface TransitionValidationResult {
  valid: boolean;
  reason?: string;
  requirements?: string[];
}

// Workflow execution context
export interface WorkflowExecutionContext {
  specName: string;
  currentPhase: Phase;
  targetPhase: Phase;
  user?: string;
  skipValidation?: boolean;
}

/**
 * Workflow Engine manages the execution of software development workflows
 */
export class WorkflowEngine {
  private config: WorkflowConfig;
  private logger: Logger;
  private activeWorkflows: Map<string, WorkflowContext> = new Map();
  private phaseDefinitions: Map<WorkflowPhase, PhaseDefinition> = new Map();
  private workflowRules: WorkflowRules;
  private workflowHistory: Map<string, WorkflowEvent[]> = new Map();
  private pendingApprovals: Map<string, ApprovalInfo[]> = new Map();

  /**
   * Creates a new WorkflowEngine instance
   * @param config - Workflow configuration
   * @param logger - Logger instance for structured logging
   */
  constructor(config: WorkflowConfig, logger: Logger) {
    this.config = {
      enableApprovalWorkflow: true,
      rulesPath: 'config/workflow-rules.json',
      baseDirectory: '.specster',
      ...config
    };
    this.logger = logger;
    this.initializePhaseDefinitions();
    this.workflowRules = this.loadWorkflowRules();
  }

  /**
   * Initializes the default phase definitions
   */
  private initializePhaseDefinitions(): void {
    const defaultPhases: PhaseDefinition[] = [
      {
        phase: WorkflowPhase.REQUIREMENTS,
        name: 'Requirements Analysis',
        description: 'Gather and analyze project requirements',
        estimatedDuration: 120 // minutes
      },
      {
        phase: WorkflowPhase.DESIGN,
        name: 'System Design',
        description: 'Create system architecture and design',
        dependencies: [WorkflowPhase.REQUIREMENTS],
        estimatedDuration: 180
      },
      {
        phase: WorkflowPhase.IMPLEMENTATION,
        name: 'Implementation',
        description: 'Implement the system based on design',
        dependencies: [WorkflowPhase.DESIGN],
        estimatedDuration: 360
      },
      {
        phase: WorkflowPhase.TESTING,
        name: 'Testing',
        description: 'Test the implemented system',
        dependencies: [WorkflowPhase.IMPLEMENTATION],
        estimatedDuration: 90
      },
      {
        phase: WorkflowPhase.DEPLOYMENT,
        name: 'Deployment',
        description: 'Deploy the system to production',
        dependencies: [WorkflowPhase.TESTING],
        estimatedDuration: 60
      }
    ];

    defaultPhases.forEach(phase => {
      this.phaseDefinitions.set(phase.phase, phase);
    });
  }

  /**
   * Starts a new workflow
   * @param projectId - Project identifier
   * @param workflowId - Workflow identifier
   * @param initialData - Initial workflow data
   * @returns Promise resolving to workflow context
   */
  async startWorkflow(projectId: string, workflowId: string, initialData?: Record<string, any>): Promise<WorkflowContext> {
    this.logger.info(`Starting workflow ${workflowId} for project ${projectId}`);

    const context: WorkflowContext = {
      projectId,
      workflowId,
      currentPhase: this.config.phases[0],
      data: initialData || {},
      history: [],
      approvalHistory: []
    };

    this.activeWorkflows.set(workflowId, context);

    // Record initial transition
    const transition: PhaseTransition = {
      fromPhase: null,
      toPhase: context.currentPhase,
      timestamp: new Date(),
      reason: 'Workflow started'
    };

    context.history.push(transition);

    // TODO: Implement actual workflow startup logic
    return context;
  }

  /**
   * Executes a specific phase
   * @param workflowId - Workflow identifier
   * @param phase - Phase to execute
   * @param phaseData - Data for phase execution
   * @returns Promise resolving to workflow result
   */
  async executePhase(workflowId: string, phase: WorkflowPhase, phaseData?: Record<string, any>): Promise<WorkflowResult> {
    const context = this.activeWorkflows.get(workflowId);
    if (!context) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    this.logger.info(`Executing phase ${phase} for workflow ${workflowId}`);

    try {
      // TODO: Implement actual phase execution logic
      const result = await this.performPhaseExecution(context, phase, phaseData);
      
      // Update context with result
      context.data = { ...context.data, ...result.data };
      
      return result;
    } catch (error) {
      this.logger.error(`Phase execution failed for ${phase}`, error as Error);
      return {
        success: false,
        phase,
        error: (error as Error).message
      };
    }
  }

  /**
   * Transitions to the next phase
   * @param workflowId - Workflow identifier
   * @param targetPhase - Target phase to transition to
   * @param reason - Reason for transition
   * @returns Promise resolving to success status
   */
  async transitionToPhase(workflowId: string, targetPhase: WorkflowPhase, reason?: string): Promise<boolean> {
    const context = this.activeWorkflows.get(workflowId);
    if (!context) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    this.logger.info(`Transitioning workflow ${workflowId} to phase ${targetPhase}`);

    // Validate transition
    if (!this.canTransitionTo(context.currentPhase, targetPhase)) {
      this.logger.warn(`Invalid transition from ${context.currentPhase} to ${targetPhase}`);
      return false;
    }

    // Record transition
    const transition: PhaseTransition = {
      fromPhase: context.currentPhase,
      toPhase: targetPhase,
      timestamp: new Date(),
      reason
    };

    context.history.push(transition);
    context.currentPhase = targetPhase;

    // TODO: Implement actual transition logic
    return true;
  }

  /**
   * Gets the current workflow status
   * @param workflowId - Workflow identifier
   * @returns Current workflow context or null if not found
   */
  getWorkflowStatus(workflowId: string): WorkflowContext | null {
    return this.activeWorkflows.get(workflowId) || null;
  }

  /**
   * Cancels a workflow
   * @param workflowId - Workflow identifier
   * @param reason - Reason for cancellation
   * @returns Promise resolving to success status
   */
  async cancelWorkflow(workflowId: string, reason?: string): Promise<boolean> {
    const context = this.activeWorkflows.get(workflowId);
    if (!context) {
      return false;
    }

    this.logger.info(`Cancelling workflow ${workflowId}: ${reason || 'No reason provided'}`);

    // TODO: Implement actual cancellation logic
    this.activeWorkflows.delete(workflowId);
    return true;
  }

  /**
   * Validates if a phase transition is allowed
   * @param currentPhase - Current phase
   * @param targetPhase - Target phase
   * @returns Whether transition is allowed
   */
  private canTransitionTo(currentPhase: WorkflowPhase, targetPhase: WorkflowPhase): boolean {
    const targetDefinition = this.phaseDefinitions.get(targetPhase);
    if (!targetDefinition || !targetDefinition.dependencies) {
      return true;
    }

    // TODO: Implement actual dependency validation
    return targetDefinition.dependencies.includes(currentPhase);
  }

  /**
   * Performs the actual phase execution
   * @param context - Workflow context
   * @param phase - Phase to execute
   * @param phaseData - Phase execution data
   * @returns Promise resolving to workflow result
   */
  private async performPhaseExecution(context: WorkflowContext, phase: WorkflowPhase, phaseData?: Record<string, any>): Promise<WorkflowResult> {
    // TODO: Implement actual phase execution logic based on phase type
    return {
      success: true,
      phase,
      data: phaseData || {}
    };
  }

  /**
   * Gets all active workflows
   * @returns Array of workflow contexts
   */
  getActiveWorkflows(): WorkflowContext[] {
    return Array.from(this.activeWorkflows.values());
  }

  /**
   * Gets phase definition
   * @param phase - Phase to get definition for
   * @returns Phase definition or null if not found
   */
  getPhaseDefinition(phase: WorkflowPhase): PhaseDefinition | null {
    return this.phaseDefinitions.get(phase) || null;
  }

  // === Private Helper Methods ===

  /**
   * Loads workflow rules from configuration
   * @returns Workflow rules
   */
  private loadWorkflowRules(): WorkflowRules {
    // Default workflow rules for the spec-driven development process
    const defaultRules: WorkflowRules = {
      phaseTransitions: {
        [Phase.INIT]: [Phase.REQUIREMENTS],
        [Phase.REQUIREMENTS]: [Phase.DESIGN],
        [Phase.DESIGN]: [Phase.TASKS],
        [Phase.TASKS]: [Phase.COMPLETE],
        [Phase.COMPLETE]: [] // Terminal phase
      },
      approvalRequired: [Phase.DESIGN, Phase.TASKS, Phase.COMPLETE],
      autoTransition: this.config.autoTransition || false,
      validators: {
        [Phase.INIT]: [],
        [Phase.REQUIREMENTS]: ['requirements-validator'],
        [Phase.DESIGN]: ['design-validator'],
        [Phase.TASKS]: ['tasks-validator'],
        [Phase.COMPLETE]: ['completion-validator']
      }
    };

    // TODO: Load from file if rulesPath is specified
    if (this.config.rulesPath) {
      try {
        // Load rules from file when implemented
        return defaultRules;
      } catch (error) {
        this.logger.warn('Failed to load workflow rules from file, using defaults', error as Error);
      }
    }

    return defaultRules;
  }

  /**
   * Checks if requirements phase is complete
   * @param specName - Specification name
   * @returns Promise resolving to completion status
   */
  private async isRequirementsComplete(specName: string): Promise<boolean> {
    // Check if requirements.md exists and has content
    const requirementsPath = path.join(this.config.baseDirectory || '.specster', 'specs', specName, 'requirements.md');
    try {
      const content = await fs.readFile(requirementsPath, 'utf8');
      return content.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Checks if design phase is complete
   * @param specName - Specification name
   * @returns Promise resolving to completion status
   */
  private async isDesignComplete(specName: string): Promise<boolean> {
    // Check if design.md exists and has content
    const designPath = path.join(this.config.baseDirectory || '.specster', 'specs', specName, 'design.md');
    try {
      const content = await fs.readFile(designPath, 'utf8');
      return content.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Checks if tasks phase is complete
   * @param specName - Specification name
   * @returns Promise resolving to completion status
   */
  private async isTasksComplete(specName: string): Promise<boolean> {
    // Check if tasks.md exists and has content
    const tasksPath = path.join(this.config.baseDirectory || '.specster', 'specs', specName, 'tasks.md');
    try {
      const content = await fs.readFile(tasksPath, 'utf8');
      return content.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Runs a custom validator
   * @param validator - Validator name
   * @param context - Workflow execution context
   * @returns Promise resolving to validation result
   */
  private async runValidator(validator: string, context: WorkflowExecutionContext): Promise<TransitionValidationResult> {
    // TODO: Implement custom validator system
    // For now, return valid for all validators
    this.logger.debug(`Running validator: ${validator} for ${context.specName}`);
    return { valid: true };
  }

  /**
   * Performs the actual phase transition
   * @param context - Workflow execution context
   * @returns Promise resolving when transition is complete
   */
  private async performPhaseTransition(context: WorkflowExecutionContext): Promise<void> {
    // TODO: Integrate with state manager to update phase
    this.logger.info(`Transitioning ${context.specName} from ${context.currentPhase} to ${context.targetPhase}`);
    
    // Clear approval for the completed phase
    const approvals = this.pendingApprovals.get(context.specName) || [];
    const filteredApprovals = approvals.filter(a => a.phase !== context.targetPhase);
    this.pendingApprovals.set(context.specName, filteredApprovals);
  }

  /**
   * Persists workflow history to file
   * @param specName - Specification name
   * @param events - Workflow events
   * @returns Promise resolving when persistence is complete
   */
  private async persistWorkflowHistory(specName: string, events: WorkflowEvent[]): Promise<void> {
    const historyPath = path.join('.specster', 'state', `history-${specName}.json`);
    const serializedEvents = events.map(event => ({
      ...event,
      timestamp: event.timestamp.toISOString()
    }));
    
    try {
      await fs.mkdir(path.dirname(historyPath), { recursive: true });
      await fs.writeFile(historyPath, JSON.stringify(serializedEvents, null, 2), 'utf8');
    } catch (error) {
      this.logger.error('Failed to persist workflow history', error as Error);
    }
  }

  /**
   * Loads workflow history from file
   * @param specName - Specification name
   * @returns Promise resolving to workflow events
   */
  private async loadWorkflowHistory(specName: string): Promise<WorkflowEvent[]> {
    const historyPath = path.join('.specster', 'state', `history-${specName}.json`);
    
    try {
      const content = await fs.readFile(historyPath, 'utf8');
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

  // === Approval Workflow Methods ===

  /**
   * Requests approval for a phase transition
   * @param specName - Specification name
   * @param fromPhase - Current phase
   * @param toPhase - Target phase
   * @param content - Content to be approved
   * @param requestedBy - User requesting approval
   * @returns Promise resolving to approval request
   */
  async requestApproval(
    specName: string,
    fromPhase: Phase,
    toPhase: Phase,
    content: string,
    requestedBy: string
  ): Promise<ApprovalRequest> {
    this.logger.info(`Requesting approval for ${specName}: ${fromPhase} -> ${toPhase}`);

    const approvalRequest: ApprovalRequest = {
      id: `${specName}-${toPhase}-${Date.now()}`,
      specName,
      fromPhase,
      toPhase,
      requestedBy,
      requestedAt: new Date(),
      content,
      status: 'pending',
      expiresAt: this.config.approvalTimeout
        ? new Date(Date.now() + this.config.approvalTimeout)
        : undefined
    };

    // Store approval request in workflow context
    const workflowId = `${specName}-workflow`;
    const context = this.activeWorkflows.get(workflowId);
    if (context) {
      context.pendingApproval = approvalRequest;
    }

    // Record approval request event
    await this.recordWorkflowEvent(specName, {
      id: `${specName}-approval-requested-${Date.now()}`,
      timestamp: new Date(),
      specName,
      phase: toPhase,
      action: 'approval_requested',
      details: { fromPhase, toPhase, requestedBy },
      userId: requestedBy
    });

    return approvalRequest;
  }

  /**
   * Provides approval for a pending request
   * @param specName - Specification name
   * @param approvalId - Approval request ID
   * @param approvedBy - User providing approval
   * @param approved - Whether approved or rejected
   * @param comments - Optional comments
   * @returns Promise resolving to approval record
   */
  async provideApproval(
    specName: string,
    approvalId: string,
    approvedBy: string,
    approved: boolean,
    comments?: string
  ): Promise<ApprovalRecord> {
    this.logger.info(`Providing approval for ${specName}: ${approved ? 'approved' : 'rejected'}`);

    const workflowId = `${specName}-workflow`;
    const context = this.activeWorkflows.get(workflowId);
    
    if (!context || !context.pendingApproval || context.pendingApproval.id !== approvalId) {
      throw new Error(`No pending approval found for ${approvalId}`);
    }

    const approvalRequest = context.pendingApproval;
    
    // Check if approval has expired
    if (approvalRequest.expiresAt && new Date() > approvalRequest.expiresAt) {
      approvalRequest.status = 'expired';
      throw new Error(`Approval request ${approvalId} has expired`);
    }

    // Update approval status
    approvalRequest.status = approved ? 'approved' : 'rejected';

    // Create approval record
    const approvalRecord: ApprovalRecord = {
      id: `${specName}-${approvalRequest.toPhase}-approval-${Date.now()}`,
      specName,
      phase: approvalRequest.toPhase,
      action: approved ? 'approved' : 'rejected',
      approvedBy,
      approvedAt: new Date(),
      comments,
      content: approvalRequest.content
    };

    // Add to approval history
    context.approvalHistory.push(approvalRecord);

    // Clear pending approval
    context.pendingApproval = undefined;

    // Record approval event
    await this.recordWorkflowEvent(specName, {
      id: `${specName}-approval-${approved ? 'approved' : 'rejected'}-${Date.now()}`,
      timestamp: new Date(),
      specName,
      phase: approvalRequest.toPhase,
      action: approved ? 'approval_approved' : 'approval_rejected',
      details: { approvalId, approvedBy, comments },
      userId: approvedBy
    });

    return approvalRecord;
  }

  /**
   * Validates if a phase transition requires and has approval
   * @param specName - Specification name
   * @param fromPhase - Current phase
   * @param toPhase - Target phase
   * @returns Promise resolving to validation result
   */
  async validatePhaseTransitionApproval(
    specName: string,
    fromPhase: Phase,
    toPhase: Phase
  ): Promise<{ valid: boolean; reason?: string; requiresApproval?: boolean }> {
    this.logger.debug(`Validating phase transition approval for ${specName}: ${fromPhase} -> ${toPhase}`);

    // Check if approval workflow is enabled
    if (!this.config.enableApprovalWorkflow) {
      return { valid: true, requiresApproval: false };
    }

    // Check if this transition requires approval
    const requiresApproval = this.workflowRules.approvalRequired.includes(toPhase);
    
    if (!requiresApproval) {
      return { valid: true, requiresApproval: false };
    }

    // Check if there's an approved transition
    const workflowId = `${specName}-workflow`;
    const context = this.activeWorkflows.get(workflowId);
    
    if (!context) {
      return { valid: false, reason: 'Workflow context not found', requiresApproval: true };
    }

    // Check for recent approval
    const recentApproval = context.approvalHistory.find(approval => 
      approval.phase === toPhase && 
      approval.action === 'approved' &&
      // Consider approval valid if it's within the last hour
      (Date.now() - approval.approvedAt.getTime()) < 3600000
    );

    if (recentApproval) {
      return { valid: true, requiresApproval: true };
    }

    // Check for pending approval
    if (context.pendingApproval && context.pendingApproval.toPhase === toPhase) {
      return { 
        valid: false, 
        reason: 'Approval is pending', 
        requiresApproval: true 
      };
    }

    return { 
      valid: false, 
      reason: 'Phase transition requires approval', 
      requiresApproval: true 
    };
  }

  /**
   * Gets pending approval for a specification
   * @param specName - Specification name
   * @returns Pending approval request or null
   */
  async getPendingApproval(specName: string): Promise<ApprovalRequest | null> {
    const workflowId = `${specName}-workflow`;
    const context = this.activeWorkflows.get(workflowId);
    
    if (!context || !context.pendingApproval) {
      return null;
    }

    // Check if approval has expired
    if (context.pendingApproval.expiresAt && new Date() > context.pendingApproval.expiresAt) {
      context.pendingApproval.status = 'expired';
      context.pendingApproval = undefined;
      return null;
    }

    return context.pendingApproval;
  }

  /**
   * Gets approval history for a specification
   * @param specName - Specification name
   * @returns Array of approval records
   */
  async getApprovalHistory(specName: string): Promise<ApprovalRecord[]> {
    const workflowId = `${specName}-workflow`;
    const context = this.activeWorkflows.get(workflowId);
    
    return context ? context.approvalHistory : [];
  }

  /**
   * Checks if explicit approval is required for ground-truth progression
   * @param specName - Specification name
   * @param phase - Current phase
   * @param content - Content to be approved
   * @returns Promise resolving to approval requirement
   */
  async checkApprovalRequirement(
    specName: string,
    phase: Phase,
    content: string
  ): Promise<{ required: boolean; message?: string }> {
    if (!this.config.requireExplicitApproval) {
      return { required: false };
    }

    const phaseNames: Record<Phase, string> = {
      [Phase.INIT]: 'initialization',
      [Phase.REQUIREMENTS]: 'requirements',
      [Phase.DESIGN]: 'design',
      [Phase.TASKS]: 'tasks',
      [Phase.COMPLETE]: 'completion'
    };

    const phaseName = phaseNames[phase] || phase;
    
    return {
      required: true,
      message: `Please review the ${phaseName} document and provide explicit approval. Do the ${phaseName} look good? If so, we can move on to the next phase.`
    };
  }

  /**
   * Records a workflow event
   * @param specName - Specification name
   * @param event - Workflow event
   * @returns Promise resolving when event is recorded
   */
  private async recordWorkflowEvent(specName: string, event: WorkflowEvent): Promise<void> {
    const events = this.workflowHistory.get(specName) || [];
    events.push(event);
    this.workflowHistory.set(specName, events);
    
    // Persist workflow history
    await this.persistWorkflowHistory(specName, events);
  }

  /**
   * Cleans up workflow engine resources
   * @returns Promise resolving when cleanup is complete
   */
  async cleanup(): Promise<void> {
    // Save any pending workflow history
    for (const [specName, events] of this.workflowHistory.entries()) {
      await this.persistWorkflowHistory(specName, events);
    }
    
    this.workflowHistory.clear();
    this.pendingApprovals.clear();
    this.activeWorkflows.clear();
  }
}