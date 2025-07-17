// Core types for Specster MCP server
export enum Phase {
  INIT = "init",
  REQUIREMENTS = "requirements",
  DESIGN = "design",
  TASKS = "tasks",
  COMPLETE = "complete"
}

export interface PhaseInfo {
  status: 'pending' | 'in_progress' | 'completed'
  startedAt?: Date
  completedAt?: Date
  approvedBy?: string
  approvalTimestamp?: Date
}

export interface ApprovalInfo {
  phase: Phase
  approvedBy: string
  timestamp: Date
  comments?: string
}

export interface ApprovalRequest {
  id: string
  specName: string
  fromPhase: Phase
  toPhase: Phase
  requestedBy: string
  requestedAt: Date
  content: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  expiresAt?: Date
}

export interface ApprovalRecord {
  id: string
  specName: string
  phase: Phase
  action: 'approved' | 'rejected'
  approvedBy: string
  approvedAt: Date
  comments?: string
  content?: string
}

export interface FileInfo {
  path: string
  lastModified: Date
  size: number
  exists: boolean
}

export interface SpecificationState {
  metadata: {
    name: string
    description: string
    version: string
    createdAt: Date
    lastModified: Date
    author: string
  }
  workflow: {
    currentPhase: Phase
    phases: {
      requirements: PhaseInfo
      design: PhaseInfo
      tasks: PhaseInfo
    }
    approvals: ApprovalInfo[]
  }
  files: {
    requirements: FileInfo
    design: FileInfo
    tasks: FileInfo
  }
}

export interface WorkflowEvent {
  id: string
  timestamp: Date
  specName: string
  phase: Phase
  action: string
  details?: any
  userId?: string
}

export interface ValidationRule {
  name: string
  description: string
  phase: Phase
  validator: (spec: SpecificationState) => ValidationResult
}

export interface ValidationResult {
  valid: boolean
  message?: string
  errors?: string[]
}

// MCP Tool Results
export interface SpecResult {
  success: boolean
  specName: string
  message: string
  data?: any
}

export interface PhaseResult {
  success: boolean
  specName: string
  phase: Phase
  message: string
  data?: any
}

export interface DesignResult {
  success: boolean
  specName: string
  design: string
  message: string
}

export interface TaskResult {
  success: boolean
  specName: string
  tasks: string
  message: string
}

export interface StatusResult {
  success: boolean
  specName: string
  currentPhase: Phase
  progress: {
    requirements: PhaseInfo
    design: PhaseInfo
    tasks: PhaseInfo
  }
  nextAction?: string
}

export interface ProgressResult {
  success: boolean
  specName: string
  phase: Phase
  completed: boolean
  message: string
}

export interface SaveResult {
  success: boolean
  filePath: string
  message: string
}

export interface LoadResult {
  success: boolean
  filePath: string
  content: string
  message: string
}

export interface TemplateResult {
  success: boolean
  templateName: string
  renderedContent: string
  message: string
}

// Configuration types
export interface SpecsterConfig {
  dataDir: string
  templatesDir: string
  defaultAuthor: string
  enableValidation: boolean
  validationRules: ValidationRule[]
}

// Error types
export class SpecsterError extends Error {
  constructor(
    message: string,
    public code: string,
    public specName?: string,
    public phase?: Phase
  ) {
    super(message)
    this.name = 'SpecsterError'
  }
}

export class PhaseTransitionError extends SpecsterError {
  constructor(
    public currentPhase: Phase,
    public targetPhase: Phase,
    public reason: string
  ) {
    super(`Cannot transition from ${currentPhase} to ${targetPhase}: ${reason}`, 'PHASE_TRANSITION_ERROR')
  }
}

export class ValidationError extends SpecsterError {
  constructor(
    message: string,
    public validationErrors: string[]
  ) {
    super(message, 'VALIDATION_ERROR')
  }
}

export class FileOperationError extends SpecsterError {
  constructor(
    message: string,
    public operation: string,
    public filePath: string
  ) {
    super(message, 'FILE_OPERATION_ERROR')
  }
}