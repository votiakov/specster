/**
 * Template Manager for Specster MCP Server
 * Handles template processing and management for code generation
 */

import { Logger } from './logger.js';
import { WorkflowPhase } from './workflow-engine.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface TemplateManagerConfig {
  templateDirectory: string;
  cacheEnabled: boolean;
  maxCacheSize: number;
  customDelimiters?: {
    start: string;
    end: string;
  };
}

export interface Template {
  id: string;
  name: string;
  description: string;
  phase: WorkflowPhase;
  category: string;
  content: string;
  variables: TemplateVariable[];
  metadata: TemplateMetadata;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  defaultValue?: any;
  validation?: ValidationRule;
}

export interface ValidationRule {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  enum?: any[];
}

export interface TemplateMetadata {
  version: string;
  author: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  dependencies?: string[];
  outputFormat: string;
}

export interface TemplateContext {
  variables: Record<string, any>;
  phase: WorkflowPhase;
  projectId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface TemplateResult {
  content: string;
  variables: Record<string, any>;
  metadata: {
    templateId: string;
    processedAt: Date;
    processingTime: number;
  };
}

export interface TemplateSearchQuery {
  phase?: WorkflowPhase;
  category?: string;
  tags?: string[];
  name?: string;
  author?: string;
}

/**
 * Template Manager handles template processing and code generation
 */
export class TemplateManager {
  private config: TemplateManagerConfig;
  private logger: Logger;
  private templates: Map<string, Template> = new Map();
  private templateCache: Map<string, string> = new Map();
  private processingHistory: Map<string, TemplateResult[]> = new Map();

  /**
   * Creates a new TemplateManager instance
   * @param config - Template manager configuration
   * @param logger - Logger instance for structured logging
   */
  constructor(config: TemplateManagerConfig, logger: Logger) {
    this.config = {
      customDelimiters: {
        start: '{{',
        end: '}}'
      },
      ...config
    };
    this.logger = logger;
    this.initializeDefaultTemplates();
  }

  /**
   * Loads a template from the template directory
   * @param templateId - Template identifier
   * @returns Promise resolving to template or null if not found
   */
  async loadTemplate(templateId: string): Promise<Template | null> {
    this.logger.debug(`Loading template ${templateId}`);

    // Check if template is already loaded
    if (this.templates.has(templateId)) {
      return this.templates.get(templateId)!;
    }

    try {
      // TODO: Implement actual template loading from file system
      const template = await this.loadTemplateFromFile(templateId);
      if (template) {
        this.templates.set(templateId, template);
        this.logger.info(`Template ${templateId} loaded successfully`);
      }
      return template;
    } catch (error) {
      this.logger.error(`Failed to load template ${templateId}`, error as Error);
      return null;
    }
  }

  /**
   * Processes a template with given context
   * @param templateId - Template identifier
   * @param context - Template context with variables
   * @returns Promise resolving to processed template result
   */
  async processTemplate(templateId: string, context: TemplateContext): Promise<TemplateResult> {
    const startTime = Date.now();
    this.logger.info(`Processing template ${templateId} for project ${context.projectId}`);

    const template = await this.loadTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    try {
      // Validate context variables
      this.validateContext(template, context);

      // Process template content
      const processedContent = await this.processTemplateContent(template, context);

      // Create result
      const result: TemplateResult = {
        content: processedContent,
        variables: context.variables,
        metadata: {
          templateId,
          processedAt: new Date(),
          processingTime: Date.now() - startTime
        }
      };

      // Store in history
      this.addToHistory(context.projectId, result);

      this.logger.info(`Template ${templateId} processed successfully in ${result.metadata.processingTime}ms`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to process template ${templateId}`, error as Error);
      throw error;
    }
  }

  /**
   * Registers a new template
   * @param template - Template to register
   * @returns Promise resolving to success status
   */
  async registerTemplate(template: Template): Promise<boolean> {
    this.logger.info(`Registering template ${template.id}`);

    try {
      // Validate template
      this.validateTemplate(template);

      // Store template
      this.templates.set(template.id, template);

      // TODO: Persist template to file system
      await this.saveTemplateToFile(template);

      this.logger.info(`Template ${template.id} registered successfully`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to register template ${template.id}`, error as Error);
      return false;
    }
  }

  /**
   * Searches for templates based on query criteria
   * @param query - Search query
   * @returns Array of matching templates
   */
  async searchTemplates(query: TemplateSearchQuery): Promise<Template[]> {
    const results: Template[] = [];

    for (const template of this.templates.values()) {
      if (this.matchesSearchQuery(template, query)) {
        results.push(template);
      }
    }

    return results;
  }

  /**
   * Gets all templates for a specific phase
   * @param phase - Workflow phase
   * @returns Array of templates for the phase
   */
  async getTemplatesForPhase(phase: WorkflowPhase): Promise<Template[]> {
    return this.searchTemplates({ phase });
  }

  /**
   * Gets template by ID
   * @param templateId - Template identifier
   * @returns Template or null if not found
   */
  getTemplate(templateId: string): Template | null {
    return this.templates.get(templateId) || null;
  }

  /**
   * Updates an existing template
   * @param templateId - Template identifier
   * @param updates - Template updates
   * @returns Promise resolving to success status
   */
  async updateTemplate(templateId: string, updates: Partial<Template>): Promise<boolean> {
    this.logger.info(`Updating template ${templateId}`);

    const template = this.templates.get(templateId);
    if (!template) {
      this.logger.error(`Template ${templateId} not found`);
      return false;
    }

    try {
      // Apply updates
      const updatedTemplate: Template = {
        ...template,
        ...updates,
        metadata: {
          ...template.metadata,
          ...updates.metadata,
          updatedAt: new Date()
        }
      };

      // Validate updated template
      this.validateTemplate(updatedTemplate);

      // Store updated template
      this.templates.set(templateId, updatedTemplate);

      // Clear cache for this template
      this.clearTemplateCache(templateId);

      // TODO: Persist updated template to file system
      await this.saveTemplateToFile(updatedTemplate);

      this.logger.info(`Template ${templateId} updated successfully`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to update template ${templateId}`, error as Error);
      return false;
    }
  }

  /**
   * Deletes a template
   * @param templateId - Template identifier
   * @returns Promise resolving to success status
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    this.logger.info(`Deleting template ${templateId}`);

    const existed = this.templates.delete(templateId);
    if (!existed) {
      return false;
    }

    // Clear cache
    this.clearTemplateCache(templateId);

    // TODO: Remove template file
    await this.deleteTemplateFile(templateId);

    this.logger.info(`Template ${templateId} deleted successfully`);
    return true;
  }

  /**
   * Gets processing history for a project
   * @param projectId - Project identifier
   * @returns Array of template results
   */
  getProcessingHistory(projectId: string): TemplateResult[] {
    return this.processingHistory.get(projectId) || [];
  }

  /**
   * Validates template context variables
   * @param template - Template definition
   * @param context - Template context
   */
  private validateContext(template: Template, context: TemplateContext): void {
    for (const variable of template.variables) {
      const value = context.variables[variable.name];

      // Check required variables
      if (variable.required && (value === undefined || value === null)) {
        throw new Error(`Required variable '${variable.name}' is missing`);
      }

      // Skip validation for optional missing variables
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      if (!this.isValidType(value, variable.type)) {
        throw new Error(`Variable '${variable.name}' has invalid type. Expected ${variable.type}`);
      }

      // Custom validation rules
      if (variable.validation) {
        this.validateVariableRule(variable.name, value, variable.validation);
      }
    }
  }

  /**
   * Validates a variable against its validation rule
   * @param name - Variable name
   * @param value - Variable value
   * @param rule - Validation rule
   */
  private validateVariableRule(name: string, value: any, rule: ValidationRule): void {
    if (rule.pattern && typeof value === 'string') {
      const regex = new RegExp(rule.pattern);
      if (!regex.test(value)) {
        throw new Error(`Variable '${name}' does not match required pattern`);
      }
    }

    if (rule.minLength !== undefined && typeof value === 'string' && value.length < rule.minLength) {
      throw new Error(`Variable '${name}' is too short. Minimum length is ${rule.minLength}`);
    }

    if (rule.maxLength !== undefined && typeof value === 'string' && value.length > rule.maxLength) {
      throw new Error(`Variable '${name}' is too long. Maximum length is ${rule.maxLength}`);
    }

    if (rule.min !== undefined && typeof value === 'number' && value < rule.min) {
      throw new Error(`Variable '${name}' is too small. Minimum value is ${rule.min}`);
    }

    if (rule.max !== undefined && typeof value === 'number' && value > rule.max) {
      throw new Error(`Variable '${name}' is too large. Maximum value is ${rule.max}`);
    }

    if (rule.enum && !rule.enum.includes(value)) {
      throw new Error(`Variable '${name}' must be one of: ${rule.enum.join(', ')}`);
    }
  }

  /**
   * Checks if value is of expected type
   * @param value - Value to check
   * @param expectedType - Expected type
   * @returns Whether value matches type
   */
  private isValidType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * Processes template content with context variables
   * @param template - Template definition
   * @param context - Template context
   * @returns Processed template content
   */
  private async processTemplateContent(template: Template, context: TemplateContext): Promise<string> {
    const cacheKey = `${template.id}_${JSON.stringify(context.variables)}`;
    
    // Check cache
    if (this.config.cacheEnabled && this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey)!;
    }

    // Process template
    let content = template.content;
    
    // Replace variables
    for (const [key, value] of Object.entries(context.variables)) {
      const placeholder = `${this.config.customDelimiters!.start}${key}${this.config.customDelimiters!.end}`;
      content = content.replace(new RegExp(placeholder, 'g'), String(value));
    }

    // TODO: Implement more sophisticated template processing (loops, conditionals, etc.)
    
    // Cache result
    if (this.config.cacheEnabled) {
      this.cacheTemplate(cacheKey, content);
    }

    return content;
  }

  /**
   * Validates template structure
   * @param template - Template to validate
   */
  private validateTemplate(template: Template): void {
    if (!template.id || !template.name || !template.content) {
      throw new Error('Template must have id, name, and content');
    }

    if (!Object.values(WorkflowPhase).includes(template.phase)) {
      throw new Error(`Invalid phase: ${template.phase}`);
    }

    // Validate variables
    for (const variable of template.variables) {
      if (!variable.name || !variable.type) {
        throw new Error('Template variables must have name and type');
      }
    }
  }

  /**
   * Checks if template matches search query
   * @param template - Template to check
   * @param query - Search query
   * @returns Whether template matches query
   */
  private matchesSearchQuery(template: Template, query: TemplateSearchQuery): boolean {
    if (query.phase && template.phase !== query.phase) {
      return false;
    }

    if (query.category && template.category !== query.category) {
      return false;
    }

    if (query.name && !template.name.toLowerCase().includes(query.name.toLowerCase())) {
      return false;
    }

    if (query.author && template.metadata.author !== query.author) {
      return false;
    }

    if (query.tags && query.tags.length > 0) {
      const hasMatchingTag = query.tags.some(tag => 
        template.metadata.tags.includes(tag)
      );
      if (!hasMatchingTag) {
        return false;
      }
    }

    return true;
  }

  /**
   * Caches processed template content
   * @param key - Cache key
   * @param content - Processed content
   */
  private cacheTemplate(key: string, content: string): void {
    if (this.templateCache.size >= this.config.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.templateCache.keys().next().value;
      if (firstKey) {
        this.templateCache.delete(firstKey);
      }
    }

    this.templateCache.set(key, content);
  }

  /**
   * Clears template cache for a specific template
   * @param templateId - Template identifier
   */
  private clearTemplateCache(templateId: string): void {
    const keysToDelete = Array.from(this.templateCache.keys()).filter(key => 
      key.startsWith(templateId)
    );

    keysToDelete.forEach(key => this.templateCache.delete(key));
  }

  /**
   * Adds template result to processing history
   * @param projectId - Project identifier
   * @param result - Template result
   */
  private addToHistory(projectId: string, result: TemplateResult): void {
    const history = this.processingHistory.get(projectId) || [];
    history.push(result);
    
    // Keep only last 50 results per project
    if (history.length > 50) {
      history.shift();
    }
    
    this.processingHistory.set(projectId, history);
  }

  /**
   * Initializes default templates
   */
  private initializeDefaultTemplates(): void {
    // TODO: Initialize default templates for each phase
    this.logger.info('Initializing default templates');
  }

  /**
   * Loads template from file system
   * @param templateId - Template identifier
   * @returns Promise resolving to template or null
   */
  private async loadTemplateFromFile(templateId: string): Promise<Template | null> {
    try {
      const templatePath = path.join(this.config.templateDirectory, templateId);
      const content = await fs.readFile(templatePath, 'utf8');
      
      // Create template object
      const template: Template = {
        id: templateId,
        name: templateId.replace(/\.[^/.]+$/, ''), // Remove extension
        description: `Template for ${templateId}`,
        phase: this.determinePhaseFromTemplate(templateId),
        category: this.determineCategoryFromTemplate(templateId),
        content,
        variables: this.extractVariablesFromContent(content),
        metadata: {
          version: '1.0.0',
          author: 'System',
          createdAt: new Date(),
          updatedAt: new Date(),
          tags: [this.determinePhaseFromTemplate(templateId)],
          outputFormat: 'markdown'
        }
      };
      
      return template;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Saves template to file system
   * @param template - Template to save
   * @returns Promise resolving when save is complete
   */
  private async saveTemplateToFile(template: Template): Promise<void> {
    // TODO: Implement actual file saving
  }

  /**
   * Deletes template file
   * @param templateId - Template identifier
   * @returns Promise resolving when deletion is complete
   */
  private async deleteTemplateFile(templateId: string): Promise<void> {
    // TODO: Implement actual file deletion
  }

  /**
   * Gets all registered templates
   * @returns Array of all templates
   */
  getAllTemplates(): Template[] {
    return Array.from(this.templates.values());
  }

  /**
   * Clears all template caches
   */
  clearAllCaches(): void {
    this.templateCache.clear();
    this.logger.info('All template caches cleared');
  }

  /**
   * Determines workflow phase from template filename
   * @param templateId - Template identifier
   * @returns Workflow phase
   */
  private determinePhaseFromTemplate(templateId: string): WorkflowPhase {
    const lowerTemplateId = templateId.toLowerCase();
    
    if (lowerTemplateId.includes('requirement')) {
      return WorkflowPhase.REQUIREMENTS;
    } else if (lowerTemplateId.includes('design')) {
      return WorkflowPhase.DESIGN;
    } else if (lowerTemplateId.includes('task') || lowerTemplateId.includes('implementation')) {
      return WorkflowPhase.IMPLEMENTATION;
    } else if (lowerTemplateId.includes('test')) {
      return WorkflowPhase.TESTING;
    } else if (lowerTemplateId.includes('deploy')) {
      return WorkflowPhase.DEPLOYMENT;
    }
    
    return WorkflowPhase.REQUIREMENTS; // Default
  }

  /**
   * Determines category from template filename
   * @param templateId - Template identifier
   * @returns Category string
   */
  private determineCategoryFromTemplate(templateId: string): string {
    const lowerTemplateId = templateId.toLowerCase();
    
    if (lowerTemplateId.includes('requirement')) {
      return 'requirements';
    } else if (lowerTemplateId.includes('design')) {
      return 'design';
    } else if (lowerTemplateId.includes('task') || lowerTemplateId.includes('implementation')) {
      return 'implementation';
    } else if (lowerTemplateId.includes('test')) {
      return 'testing';
    } else if (lowerTemplateId.includes('deploy')) {
      return 'deployment';
    }
    
    return 'general';
  }

  /**
   * Extracts variables from template content
   * @param content - Template content
   * @returns Array of template variables
   */
  private extractVariablesFromContent(content: string): TemplateVariable[] {
    const variables: TemplateVariable[] = [];
    const regex = /\{\{(\w+)\}\}/g;
    let match;
    const foundVariables = new Set<string>();
    
    while ((match = regex.exec(content)) !== null) {
      const varName = match[1];
      if (!foundVariables.has(varName)) {
        foundVariables.add(varName);
        variables.push({
          name: varName,
          type: 'string',
          required: true,
          description: `Variable for ${varName}`,
          defaultValue: ''
        });
      }
    }
    
    return variables;
  }
}