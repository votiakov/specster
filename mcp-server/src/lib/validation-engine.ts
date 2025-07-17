/**
 * Validation Engine for Specster MCP Server
 * Handles validation logic for various workflow phases and data types
 */

import { Logger } from './logger.js';
import { WorkflowPhase } from './workflow-engine.js';

export interface ValidationEngineConfig {
  strictMode: boolean;
  customRules: ValidationRule[];
  enableCaching: boolean;
}

export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  phase: WorkflowPhase;
  category: ValidationCategory;
  severity: ValidationSeverity;
  condition: ValidationCondition;
  message: string;
  autoFix?: boolean;
}

export enum ValidationCategory {
  SYNTAX = 'syntax',
  STRUCTURE = 'structure',
  SEMANTICS = 'semantics',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  STYLE = 'style',
  BUSINESS_LOGIC = 'business_logic'
}

export enum ValidationSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
  SUGGESTION = 'suggestion'
}

export interface ValidationCondition {
  type: 'pattern' | 'function' | 'schema' | 'custom';
  value: string | Function | object;
  parameters?: Record<string, any>;
}

export interface ValidationContext {
  phase: WorkflowPhase;
  data: any;
  metadata: Record<string, any>;
  projectId: string;
  timestamp: Date;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
  metadata: {
    phase: WorkflowPhase;
    rulesApplied: number;
    validationTime: number;
    timestamp: Date;
  };
}

export interface ValidationError {
  ruleId: string;
  message: string;
  location?: ValidationLocation;
  severity: ValidationSeverity;
  category: ValidationCategory;
  autoFixable: boolean;
}

export interface ValidationWarning {
  ruleId: string;
  message: string;
  location?: ValidationLocation;
  category: ValidationCategory;
  recommendation?: string;
}

export interface ValidationSuggestion {
  ruleId: string;
  message: string;
  location?: ValidationLocation;
  category: ValidationCategory;
  improvement: string;
}

export interface ValidationLocation {
  file?: string;
  line?: number;
  column?: number;
  range?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

export interface ValidationSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, ValidationSchema>;
  items?: ValidationSchema;
  required?: string[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  enum?: any[];
}

/**
 * Validation Engine handles validation logic across all workflow phases
 */
export class ValidationEngine {
  private config: ValidationEngineConfig;
  private logger: Logger;
  private rules: Map<string, ValidationRule> = new Map();
  private phaseRules: Map<WorkflowPhase, ValidationRule[]> = new Map();
  private validationCache: Map<string, ValidationResult> = new Map();

  /**
   * Creates a new ValidationEngine instance
   * @param config - Validation engine configuration
   * @param logger - Logger instance for structured logging
   */
  constructor(config: ValidationEngineConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.initializeDefaultRules();
    this.loadCustomRules();
  }

  /**
   * Validates data for a specific workflow phase
   * @param context - Validation context
   * @returns Promise resolving to validation result
   */
  async validatePhase(context: ValidationContext): Promise<ValidationResult> {
    const startTime = Date.now();
    this.logger.info(`Validating ${context.phase} phase for project ${context.projectId}`);

    // Check cache
    if (this.config.enableCaching) {
      const cacheKey = this.generateCacheKey(context);
      const cachedResult = this.validationCache.get(cacheKey);
      if (cachedResult) {
        this.logger.debug(`Using cached validation result for ${context.phase}`);
        return cachedResult;
      }
    }

    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      metadata: {
        phase: context.phase,
        rulesApplied: 0,
        validationTime: 0,
        timestamp: new Date()
      }
    };

    try {
      // Get rules for this phase
      const phaseRules = this.phaseRules.get(context.phase) || [];
      
      // Apply each rule
      for (const rule of phaseRules) {
        await this.applyRule(rule, context, result);
        result.metadata.rulesApplied++;
      }

      // Set overall validity
      result.valid = result.errors.length === 0 && 
                    (this.config.strictMode ? result.warnings.length === 0 : true);

      result.metadata.validationTime = Date.now() - startTime;

      // Cache result
      if (this.config.enableCaching) {
        const cacheKey = this.generateCacheKey(context);
        this.validationCache.set(cacheKey, result);
      }

      this.logger.info(`Validation completed for ${context.phase} in ${result.metadata.validationTime}ms`);
      return result;
    } catch (error) {
      this.logger.error(`Validation failed for ${context.phase}`, error as Error);
      result.valid = false;
      result.errors.push({
        ruleId: 'validation_engine_error',
        message: `Validation engine error: ${(error as Error).message}`,
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.SYNTAX,
        autoFixable: false
      });
      return result;
    }
  }

  /**
   * Validates data against a specific schema
   * @param data - Data to validate
   * @param schema - Validation schema
   * @returns Validation result
   */
  async validateSchema(data: any, schema: ValidationSchema): Promise<ValidationResult> {
    this.logger.debug('Validating data against schema');

    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      metadata: {
        phase: WorkflowPhase.REQUIREMENTS, // Default phase
        rulesApplied: 1,
        validationTime: 0,
        timestamp: new Date()
      }
    };

    const startTime = Date.now();

    try {
      this.validateAgainstSchema(data, schema, result);
      result.valid = result.errors.length === 0;
      result.metadata.validationTime = Date.now() - startTime;
    } catch (error) {
      result.valid = false;
      result.errors.push({
        ruleId: 'schema_validation_error',
        message: `Schema validation error: ${(error as Error).message}`,
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.STRUCTURE,
        autoFixable: false
      });
    }

    return result;
  }

  /**
   * Registers a new validation rule
   * @param rule - Validation rule to register
   * @returns Success status
   */
  registerRule(rule: ValidationRule): boolean {
    this.logger.info(`Registering validation rule ${rule.id}`);

    try {
      // Validate rule structure
      this.validateRule(rule);

      // Store rule
      this.rules.set(rule.id, rule);

      // Add to phase rules
      const phaseRules = this.phaseRules.get(rule.phase) || [];
      phaseRules.push(rule);
      this.phaseRules.set(rule.phase, phaseRules);

      // Clear cache since rules changed
      this.clearValidationCache();

      this.logger.info(`Validation rule ${rule.id} registered successfully`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to register validation rule ${rule.id}`, error as Error);
      return false;
    }
  }

  /**
   * Removes a validation rule
   * @param ruleId - Rule identifier
   * @returns Success status
   */
  removeRule(ruleId: string): boolean {
    this.logger.info(`Removing validation rule ${ruleId}`);

    const rule = this.rules.get(ruleId);
    if (!rule) {
      return false;
    }

    // Remove from rules map
    this.rules.delete(ruleId);

    // Remove from phase rules
    const phaseRules = this.phaseRules.get(rule.phase) || [];
    const updatedPhaseRules = phaseRules.filter(r => r.id !== ruleId);
    this.phaseRules.set(rule.phase, updatedPhaseRules);

    // Clear cache
    this.clearValidationCache();

    this.logger.info(`Validation rule ${ruleId} removed successfully`);
    return true;
  }

  /**
   * Gets all validation rules for a phase
   * @param phase - Workflow phase
   * @returns Array of validation rules
   */
  getRulesForPhase(phase: WorkflowPhase): ValidationRule[] {
    return this.phaseRules.get(phase) || [];
  }

  /**
   * Gets a specific validation rule
   * @param ruleId - Rule identifier
   * @returns Validation rule or null if not found
   */
  getRule(ruleId: string): ValidationRule | null {
    return this.rules.get(ruleId) || null;
  }

  /**
   * Applies a validation rule to context
   * @param rule - Validation rule
   * @param context - Validation context
   * @param result - Validation result to update
   * @returns Promise resolving when rule is applied
   */
  private async applyRule(rule: ValidationRule, context: ValidationContext, result: ValidationResult): Promise<void> {
    try {
      const ruleResult = await this.executeRule(rule, context);
      
      if (!ruleResult.passed) {
        const error: ValidationError = {
          ruleId: rule.id,
          message: ruleResult.message || rule.message,
          location: ruleResult.location,
          severity: rule.severity,
          category: rule.category,
          autoFixable: rule.autoFix || false
        };

        switch (rule.severity) {
          case ValidationSeverity.ERROR:
            result.errors.push(error);
            break;
          case ValidationSeverity.WARNING:
            result.warnings.push({
              ruleId: rule.id,
              message: ruleResult.message || rule.message,
              location: ruleResult.location,
              category: rule.category,
              recommendation: ruleResult.recommendation
            });
            break;
          case ValidationSeverity.INFO:
          case ValidationSeverity.SUGGESTION:
            result.suggestions.push({
              ruleId: rule.id,
              message: ruleResult.message || rule.message,
              location: ruleResult.location,
              category: rule.category,
              improvement: ruleResult.improvement || 'Consider reviewing this item'
            });
            break;
        }
      }
    } catch (error) {
      this.logger.error(`Error applying rule ${rule.id}`, error as Error);
      result.errors.push({
        ruleId: rule.id,
        message: `Rule execution failed: ${(error as Error).message}`,
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.SYNTAX,
        autoFixable: false
      });
    }
  }

  /**
   * Executes a validation rule
   * @param rule - Validation rule
   * @param context - Validation context
   * @returns Rule execution result
   */
  private async executeRule(rule: ValidationRule, context: ValidationContext): Promise<{
    passed: boolean;
    message?: string;
    location?: ValidationLocation;
    recommendation?: string;
    improvement?: string;
  }> {
    switch (rule.condition.type) {
      case 'pattern':
        return this.executePatternRule(rule, context);
      case 'function':
        return this.executeFunctionRule(rule, context);
      case 'schema':
        return this.executeSchemaRule(rule, context);
      case 'custom':
        return this.executeCustomRule(rule, context);
      default:
        throw new Error(`Unknown rule type: ${rule.condition.type}`);
    }
  }

  /**
   * Executes a pattern-based rule
   * @param rule - Validation rule
   * @param context - Validation context
   * @returns Rule execution result
   */
  private executePatternRule(rule: ValidationRule, context: ValidationContext): {
    passed: boolean;
    message?: string;
    location?: ValidationLocation;
  } {
    const pattern = new RegExp(rule.condition.value as string);
    const dataString = JSON.stringify(context.data);
    const passed = pattern.test(dataString);

    return {
      passed,
      message: passed ? undefined : `Pattern validation failed: ${rule.condition.value}`
    };
  }

  /**
   * Executes a function-based rule
   * @param rule - Validation rule
   * @param context - Validation context
   * @returns Rule execution result
   */
  private async executeFunctionRule(rule: ValidationRule, context: ValidationContext): Promise<{
    passed: boolean;
    message?: string;
    location?: ValidationLocation;
  }> {
    const func = rule.condition.value as Function;
    const result = await func(context.data, context);

    return {
      passed: result === true || (typeof result === 'object' && result.passed),
      message: typeof result === 'object' ? result.message : undefined,
      location: typeof result === 'object' ? result.location : undefined
    };
  }

  /**
   * Executes a schema-based rule
   * @param rule - Validation rule
   * @param context - Validation context
   * @returns Rule execution result
   */
  private executeSchemaRule(rule: ValidationRule, context: ValidationContext): {
    passed: boolean;
    message?: string;
    location?: ValidationLocation;
  } {
    const schema = rule.condition.value as ValidationSchema;
    const validationResult = { errors: [] as ValidationError[] };
    
    this.validateAgainstSchema(context.data, schema, validationResult);

    return {
      passed: validationResult.errors.length === 0,
      message: validationResult.errors.length > 0 ? validationResult.errors[0].message : undefined
    };
  }

  /**
   * Executes a custom rule
   * @param rule - Validation rule
   * @param context - Validation context
   * @returns Rule execution result
   */
  private executeCustomRule(rule: ValidationRule, context: ValidationContext): {
    passed: boolean;
    message?: string;
    location?: ValidationLocation;
  } {
    // TODO: Implement custom rule execution
    return {
      passed: true,
      message: 'Custom rule execution not yet implemented'
    };
  }

  /**
   * Validates data against a schema
   * @param data - Data to validate
   * @param schema - Validation schema
   * @param result - Validation result to update
   * @param path - Current path in data structure
   */
  private validateAgainstSchema(data: any, schema: ValidationSchema, result: { errors: ValidationError[] }, path: string = ''): void {
    // Type validation
    if (!this.validateType(data, schema.type)) {
      result.errors.push({
        ruleId: 'schema_type_error',
        message: `Expected ${schema.type} but got ${typeof data}`,
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.STRUCTURE,
        autoFixable: false,
        location: path ? { file: path } : undefined
      });
      return;
    }

    // Type-specific validation
    switch (schema.type) {
      case 'object':
        this.validateObject(data, schema, result, path);
        break;
      case 'array':
        this.validateArray(data, schema, result, path);
        break;
      case 'string':
        this.validateString(data, schema, result, path);
        break;
      case 'number':
        this.validateNumber(data, schema, result, path);
        break;
    }
  }

  /**
   * Validates object type
   * @param data - Data to validate
   * @param schema - Validation schema
   * @param result - Validation result
   * @param path - Current path
   */
  private validateObject(data: any, schema: ValidationSchema, result: { errors: ValidationError[] }, path: string): void {
    if (schema.required) {
      for (const requiredField of schema.required) {
        if (!(requiredField in data)) {
          result.errors.push({
            ruleId: 'schema_required_field',
            message: `Required field '${requiredField}' is missing`,
            severity: ValidationSeverity.ERROR,
            category: ValidationCategory.STRUCTURE,
            autoFixable: false,
            location: { file: `${path}.${requiredField}` }
          });
        }
      }
    }

    if (schema.properties) {
      for (const [key, propertySchema] of Object.entries(schema.properties)) {
        if (key in data) {
          this.validateAgainstSchema(data[key], propertySchema, result, `${path}.${key}`);
        }
      }
    }
  }

  /**
   * Validates array type
   * @param data - Data to validate
   * @param schema - Validation schema
   * @param result - Validation result
   * @param path - Current path
   */
  private validateArray(data: any, schema: ValidationSchema, result: { errors: ValidationError[] }, path: string): void {
    if (schema.items) {
      data.forEach((item: any, index: number) => {
        this.validateAgainstSchema(item, schema.items!, result, `${path}[${index}]`);
      });
    }
  }

  /**
   * Validates string type
   * @param data - Data to validate
   * @param schema - Validation schema
   * @param result - Validation result
   * @param path - Current path
   */
  private validateString(data: any, schema: ValidationSchema, result: { errors: ValidationError[] }, path: string): void {
    if (schema.minLength && data.length < schema.minLength) {
      result.errors.push({
        ruleId: 'schema_min_length',
        message: `String too short. Minimum length is ${schema.minLength}`,
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.STRUCTURE,
        autoFixable: false,
        location: { file: path }
      });
    }

    if (schema.maxLength && data.length > schema.maxLength) {
      result.errors.push({
        ruleId: 'schema_max_length',
        message: `String too long. Maximum length is ${schema.maxLength}`,
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.STRUCTURE,
        autoFixable: false,
        location: { file: path }
      });
    }

    if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
      result.errors.push({
        ruleId: 'schema_pattern',
        message: `String does not match required pattern: ${schema.pattern}`,
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.STRUCTURE,
        autoFixable: false,
        location: { file: path }
      });
    }

    if (schema.enum && !schema.enum.includes(data)) {
      result.errors.push({
        ruleId: 'schema_enum',
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.STRUCTURE,
        autoFixable: false,
        location: { file: path }
      });
    }
  }

  /**
   * Validates number type
   * @param data - Data to validate
   * @param schema - Validation schema
   * @param result - Validation result
   * @param path - Current path
   */
  private validateNumber(data: any, schema: ValidationSchema, result: { errors: ValidationError[] }, path: string): void {
    if (schema.minimum !== undefined && data < schema.minimum) {
      result.errors.push({
        ruleId: 'schema_minimum',
        message: `Number too small. Minimum value is ${schema.minimum}`,
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.STRUCTURE,
        autoFixable: false,
        location: { file: path }
      });
    }

    if (schema.maximum !== undefined && data > schema.maximum) {
      result.errors.push({
        ruleId: 'schema_maximum',
        message: `Number too large. Maximum value is ${schema.maximum}`,
        severity: ValidationSeverity.ERROR,
        category: ValidationCategory.STRUCTURE,
        autoFixable: false,
        location: { file: path }
      });
    }
  }

  /**
   * Validates data type
   * @param data - Data to validate
   * @param expectedType - Expected type
   * @returns Whether type is valid
   */
  private validateType(data: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof data === 'string';
      case 'number':
        return typeof data === 'number';
      case 'boolean':
        return typeof data === 'boolean';
      case 'object':
        return typeof data === 'object' && data !== null && !Array.isArray(data);
      case 'array':
        return Array.isArray(data);
      default:
        return true;
    }
  }

  /**
   * Validates rule structure
   * @param rule - Validation rule
   */
  private validateRule(rule: ValidationRule): void {
    if (!rule.id || !rule.name || !rule.condition) {
      throw new Error('Validation rule must have id, name, and condition');
    }

    if (!Object.values(WorkflowPhase).includes(rule.phase)) {
      throw new Error(`Invalid phase: ${rule.phase}`);
    }

    if (!Object.values(ValidationCategory).includes(rule.category)) {
      throw new Error(`Invalid category: ${rule.category}`);
    }

    if (!Object.values(ValidationSeverity).includes(rule.severity)) {
      throw new Error(`Invalid severity: ${rule.severity}`);
    }
  }

  /**
   * Generates cache key for validation context
   * @param context - Validation context
   * @returns Cache key
   */
  private generateCacheKey(context: ValidationContext): string {
    return `${context.phase}_${context.projectId}_${JSON.stringify(context.data).substring(0, 100)}`;
  }

  /**
   * Clears validation cache
   */
  private clearValidationCache(): void {
    this.validationCache.clear();
    this.logger.debug('Validation cache cleared');
  }

  /**
   * Initializes default validation rules
   */
  private initializeDefaultRules(): void {
    this.logger.info('Initializing default validation rules');

    // TODO: Add default rules for each phase
    const defaultRules: ValidationRule[] = [
      // Requirements phase rules
      {
        id: 'requirements_not_empty',
        name: 'Requirements Not Empty',
        description: 'Ensures requirements are not empty',
        phase: WorkflowPhase.REQUIREMENTS,
        category: ValidationCategory.STRUCTURE,
        severity: ValidationSeverity.ERROR,
        condition: {
          type: 'function',
          value: (data: any) => data && Object.keys(data).length > 0
        },
        message: 'Requirements cannot be empty'
      },
      // Design phase rules
      {
        id: 'design_has_architecture',
        name: 'Design Has Architecture',
        description: 'Ensures design includes architecture information',
        phase: WorkflowPhase.DESIGN,
        category: ValidationCategory.STRUCTURE,
        severity: ValidationSeverity.WARNING,
        condition: {
          type: 'function',
          value: (data: any) => data && data.architecture
        },
        message: 'Design should include architecture information'
      }
    ];

    defaultRules.forEach(rule => this.registerRule(rule));
  }

  /**
   * Loads custom validation rules from configuration
   */
  private loadCustomRules(): void {
    this.logger.info('Loading custom validation rules');

    this.config.customRules.forEach(rule => {
      this.registerRule(rule);
    });
  }

  /**
   * Gets all validation rules
   * @returns Array of all validation rules
   */
  getAllRules(): ValidationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Gets validation statistics
   * @returns Validation statistics
   */
  getValidationStats(): {
    totalRules: number;
    rulesByPhase: Record<WorkflowPhase, number>;
    rulesByCategory: Record<ValidationCategory, number>;
    rulesBySeverity: Record<ValidationSeverity, number>;
  } {
    const stats = {
      totalRules: this.rules.size,
      rulesByPhase: {} as Record<WorkflowPhase, number>,
      rulesByCategory: {} as Record<ValidationCategory, number>,
      rulesBySeverity: {} as Record<ValidationSeverity, number>
    };

    // Initialize counters
    Object.values(WorkflowPhase).forEach(phase => {
      stats.rulesByPhase[phase] = 0;
    });
    Object.values(ValidationCategory).forEach(category => {
      stats.rulesByCategory[category] = 0;
    });
    Object.values(ValidationSeverity).forEach(severity => {
      stats.rulesBySeverity[severity] = 0;
    });

    // Count rules
    for (const rule of this.rules.values()) {
      stats.rulesByPhase[rule.phase]++;
      stats.rulesByCategory[rule.category]++;
      stats.rulesBySeverity[rule.severity]++;
    }

    return stats;
  }
}