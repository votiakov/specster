#!/usr/bin/env node

/**
 * Specster MCP Server
 * 
 * Core server for spec-driven development workflow using Claude Code's MCP integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

import { SpecsterConfig, Phase, SpecificationState } from './types/index.js';
import { WorkflowEngine, WorkflowConfig, WorkflowPhase } from './lib/workflow-engine.js';
import { StateManager, StateManagerConfig } from './lib/state-manager.js';
import { FileManager, FileManagerConfig } from './lib/file-manager.js';
import { TemplateManager, TemplateManagerConfig } from './lib/template-manager.js';
import { ValidationEngine, ValidationEngineConfig } from './lib/validation-engine.js';
import { Logger, LoggerConfig, LogLevel } from './lib/logger.js';

/**
 * MCP Server for Specster
 */
class SpecsterMCPServer {
  private server: Server;
  private config: SpecsterConfig;
  private workflowEngine: WorkflowEngine;
  private stateManager: StateManager;
  private fileManager: FileManager;
  private templateManager: TemplateManager;
  private validationEngine: ValidationEngine;
  private logger: Logger;

  constructor() {
    this.server = new Server(
      {
        name: 'specster-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.logger = new Logger({
      level: LogLevel.INFO,
      prefix: 'SpecsterMCPServer'
    });
    this.config = this.loadConfig();
    
    // Initialize core components
    const fileManagerConfig: FileManagerConfig = {
      baseDirectory: this.config.dataDir,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedExtensions: ['.md', '.json', '.txt', '.yaml', '.yml'],
      backupEnabled: true,
      compressionEnabled: false
    };
    this.fileManager = new FileManager(fileManagerConfig, this.logger);
    const templateManagerConfig: TemplateManagerConfig = {
      templateDirectory: this.config.templatesDir,
      cacheEnabled: true,
      maxCacheSize: 100
    };
    this.templateManager = new TemplateManager(templateManagerConfig, this.logger);
    const validationEngineConfig: ValidationEngineConfig = {
      strictMode: false,
      customRules: [],
      enableCaching: true
    };
    this.validationEngine = new ValidationEngine(validationEngineConfig, this.logger);
    const stateManagerConfig: StateManagerConfig = {
      persistenceEnabled: true,
      storageType: 'file',
      storagePath: `${this.config.dataDir}/state`,
      autoSave: true,
      saveInterval: 30000
    };
    this.stateManager = new StateManager(stateManagerConfig, this.logger);
    const workflowConfig: WorkflowConfig = {
      phases: [WorkflowPhase.REQUIREMENTS, WorkflowPhase.DESIGN, WorkflowPhase.IMPLEMENTATION, WorkflowPhase.TESTING, WorkflowPhase.DEPLOYMENT],
      autoTransition: false,
      timeout: 300000, // 5 minutes
      enableApprovalWorkflow: true,
      requireExplicitApproval: true,
      approvalTimeout: 3600000, // 1 hour
      baseDirectory: this.config.dataDir
    };
    this.workflowEngine = new WorkflowEngine(workflowConfig, this.logger);

    this.setupToolHandlers();
  }

  private loadConfig(): SpecsterConfig {
    const dataDir = process.env.SPECSTER_DATA_DIR || '.specster';
    const templatesDir = process.env.SPECSTER_TEMPLATES_DIR || '.specster/templates';
    const defaultAuthor = process.env.SPECSTER_DEFAULT_AUTHOR || 'Developer';
    const enableValidation = process.env.SPECSTER_ENABLE_VALIDATION !== 'false';

    return {
      dataDir,
      templatesDir,
      defaultAuthor,
      enableValidation,
      validationRules: [] // Will be loaded from config files
    };
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'initializeSpec',
          description: 'Initialize a new specification',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the specification (alphanumeric and hyphens only)'
              },
              description: {
                type: 'string',
                description: 'Brief description of the specification'
              }
            },
            required: ['name', 'description']
          }
        },
        {
          name: 'enterRequirementsPhase',
          description: 'Enter requirements gathering phase for a specification',
          inputSchema: {
            type: 'object',
            properties: {
              specName: {
                type: 'string',
                description: 'Name of the specification'
              }
            },
            required: ['specName']
          }
        },
        {
          name: 'generateDesign',
          description: 'Generate design documentation for a specification',
          inputSchema: {
            type: 'object',
            properties: {
              specName: {
                type: 'string',
                description: 'Name of the specification'
              }
            },
            required: ['specName']
          }
        },
        {
          name: 'createImplementationTasks',
          description: 'Create implementation tasks for a specification',
          inputSchema: {
            type: 'object',
            properties: {
              specName: {
                type: 'string',
                description: 'Name of the specification'
              }
            },
            required: ['specName']
          }
        },
        {
          name: 'getSpecStatus',
          description: 'Get current status of a specification',
          inputSchema: {
            type: 'object',
            properties: {
              specName: {
                type: 'string',
                description: 'Name of the specification'
              }
            },
            required: ['specName']
          }
        },
        {
          name: 'updatePhaseProgress',
          description: 'Update progress of a specific phase',
          inputSchema: {
            type: 'object',
            properties: {
              specName: {
                type: 'string',
                description: 'Name of the specification'
              },
              phase: {
                type: 'string',
                enum: ['requirements', 'design', 'tasks'],
                description: 'Phase to update'
              },
              completed: {
                type: 'boolean',
                description: 'Whether the phase is completed'
              }
            },
            required: ['specName', 'phase', 'completed']
          }
        },
        {
          name: 'validatePhaseTransition',
          description: 'Validate if a phase transition is allowed',
          inputSchema: {
            type: 'object',
            properties: {
              specName: {
                type: 'string',
                description: 'Name of the specification'
              },
              fromPhase: {
                type: 'string',
                enum: ['init', 'requirements', 'design', 'tasks'],
                description: 'Current phase'
              },
              toPhase: {
                type: 'string',
                enum: ['requirements', 'design', 'tasks', 'complete'],
                description: 'Target phase'
              }
            },
            required: ['specName', 'fromPhase', 'toPhase']
          }
        },
        {
          name: 'saveSpecificationFile',
          description: 'Save content to a specification file',
          inputSchema: {
            type: 'object',
            properties: {
              specName: {
                type: 'string',
                description: 'Name of the specification'
              },
              fileName: {
                type: 'string',
                enum: ['requirements.md', 'design.md', 'tasks.md'],
                description: 'Name of the file to save'
              },
              content: {
                type: 'string',
                description: 'Content to save'
              }
            },
            required: ['specName', 'fileName', 'content']
          }
        },
        {
          name: 'loadSpecificationFile',
          description: 'Load content from a specification file',
          inputSchema: {
            type: 'object',
            properties: {
              specName: {
                type: 'string',
                description: 'Name of the specification'
              },
              fileName: {
                type: 'string',
                enum: ['requirements.md', 'design.md', 'tasks.md'],
                description: 'Name of the file to load'
              }
            },
            required: ['specName', 'fileName']
          }
        },
        {
          name: 'applyTemplate',
          description: 'Apply template with variables',
          inputSchema: {
            type: 'object',
            properties: {
              templateName: {
                type: 'string',
                enum: ['requirements-template.md', 'design-template.md', 'tasks-template.md'],
                description: 'Name of the template to apply'
              },
              variables: {
                type: 'object',
                description: 'Variables to substitute in template'
              }
            },
            required: ['templateName', 'variables']
          }
        },
        {
          name: 'requestApproval',
          description: 'Request approval for a phase transition',
          inputSchema: {
            type: 'object',
            properties: {
              specName: {
                type: 'string',
                description: 'Name of the specification'
              },
              fromPhase: {
                type: 'string',
                enum: ['init', 'requirements', 'design', 'tasks'],
                description: 'Current phase'
              },
              toPhase: {
                type: 'string',
                enum: ['requirements', 'design', 'tasks', 'complete'],
                description: 'Target phase'
              },
              content: {
                type: 'string',
                description: 'Content to be approved'
              },
              requestedBy: {
                type: 'string',
                description: 'User requesting approval'
              }
            },
            required: ['specName', 'fromPhase', 'toPhase', 'content', 'requestedBy']
          }
        },
        {
          name: 'provideApproval',
          description: 'Provide approval for a pending request',
          inputSchema: {
            type: 'object',
            properties: {
              specName: {
                type: 'string',
                description: 'Name of the specification'
              },
              approvalId: {
                type: 'string',
                description: 'Approval request ID'
              },
              approvedBy: {
                type: 'string',
                description: 'User providing approval'
              },
              approved: {
                type: 'boolean',
                description: 'Whether approved or rejected'
              },
              comments: {
                type: 'string',
                description: 'Optional comments'
              }
            },
            required: ['specName', 'approvalId', 'approvedBy', 'approved']
          }
        },
        {
          name: 'getPendingApproval',
          description: 'Get pending approval for a specification',
          inputSchema: {
            type: 'object',
            properties: {
              specName: {
                type: 'string',
                description: 'Name of the specification'
              }
            },
            required: ['specName']
          }
        },
        {
          name: 'checkApprovalRequirement',
          description: 'Check if explicit approval is required for ground-truth progression',
          inputSchema: {
            type: 'object',
            properties: {
              specName: {
                type: 'string',
                description: 'Name of the specification'
              },
              phase: {
                type: 'string',
                enum: ['requirements', 'design', 'tasks'],
                description: 'Current phase'
              },
              content: {
                type: 'string',
                description: 'Content to be approved'
              }
            },
            required: ['specName', 'phase', 'content']
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'initializeSpec':
            return await this.handleInitializeSpec(args);
          case 'enterRequirementsPhase':
            return await this.handleEnterRequirementsPhase(args);
          case 'generateDesign':
            return await this.handleGenerateDesign(args);
          case 'createImplementationTasks':
            return await this.handleCreateImplementationTasks(args);
          case 'getSpecStatus':
            return await this.handleGetSpecStatus(args);
          case 'updatePhaseProgress':
            return await this.handleUpdatePhaseProgress(args);
          case 'validatePhaseTransition':
            return await this.handleValidatePhaseTransition(args);
          case 'saveSpecificationFile':
            return await this.handleSaveSpecificationFile(args);
          case 'loadSpecificationFile':
            return await this.handleLoadSpecificationFile(args);
          case 'applyTemplate':
            return await this.handleApplyTemplate(args);
          case 'requestApproval':
            return await this.handleRequestApproval(args);
          case 'provideApproval':
            return await this.handleProvideApproval(args);
          case 'getPendingApproval':
            return await this.handleGetPendingApproval(args);
          case 'checkApprovalRequirement':
            return await this.handleCheckApprovalRequirement(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        this.logger.error(`Error handling tool ${name}:`, error as Error);
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  // Tool handlers implementation
  private async handleInitializeSpec(args: any) {
    // Validate input
    const initializeSpecSchema = z.object({
      name: z.string().min(1).regex(/^[a-zA-Z0-9-]+$/, 'Name must contain only alphanumeric characters and hyphens'),
      description: z.string().min(1)
    });

    try {
      const { name, description } = initializeSpecSchema.parse(args);
      
      this.logger.info(`Initializing specification: ${name}`);
      
      // Create initial specification state
      const specState = await this.stateManager.initializeSpecificationState(name, {
        name,
        description,
        author: this.config.defaultAuthor
      });
      
      // Start workflow
      await this.workflowEngine.startWorkflow(name, `${name}-workflow`, { specName: name });
      
      // Create spec directory structure (required by validation hook)
      const specDirPath = path.join(this.config.dataDir, 'specs', name);
      await fs.mkdir(specDirPath, { recursive: true });
      
      this.logger.info(`Specification '${name}' initialized successfully`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            specName: name,
            message: `Specification '${name}' initialized successfully`,
            data: {
              currentPhase: specState.workflow.currentPhase,
              createdAt: specState.metadata.createdAt,
              specDir: `specs/${name}`
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error(`Failed to initialize specification:`, error as Error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `Failed to initialize specification: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }

  private async handleEnterRequirementsPhase(args: any) {
    const enterRequirementsSchema = z.object({
      specName: z.string().min(1)
    });

    try {
      const { specName } = enterRequirementsSchema.parse(args);
      
      this.logger.info(`Entering requirements phase for: ${specName}`);
      
      // Get current specification state
      const specState = await this.stateManager.getSpecificationState(specName);
      if (!specState) {
        throw new Error(`Specification '${specName}' not found`);
      }
      
      // Transition to requirements phase
      const transitioned = await this.stateManager.transitionSpecificationPhase(specName, Phase.REQUIREMENTS, this.config.defaultAuthor);
      if (!transitioned) {
        throw new Error(`Failed to transition to requirements phase`);
      }
      
      // Update workflow engine
      await this.workflowEngine.transitionToPhase(`${specName}-workflow`, WorkflowPhase.REQUIREMENTS, 'User requested requirements phase');
      
      // Generate requirements content using AI
      try {
        const requirementsContent = this.generateRequirementsContent(specName, specState.metadata.description);
        
        // Write requirements file
        const specDirPath = path.join(this.config.dataDir, 'specs', specName);
        await fs.writeFile(path.join(specDirPath, 'requirements.md'), requirementsContent, 'utf8');
        
        this.logger.info(`Requirements file created at specs/${specName}/requirements.md`);
      } catch (contentError) {
        throw new Error(`Failed to create requirements file: ${contentError instanceof Error ? contentError.message : String(contentError)}`);
      }
      
      this.logger.info(`Requirements phase entered successfully for: ${specName}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            specName,
            phase: Phase.REQUIREMENTS,
            message: `Successfully entered requirements phase for '${specName}'`,
            data: {
              requirementsFile: `specs/${specName}/requirements.md`,
              currentPhase: Phase.REQUIREMENTS
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error(`Failed to enter requirements phase:`, error as Error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `Failed to enter requirements phase: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }

  private async handleGenerateDesign(args: any) {
    const generateDesignSchema = z.object({
      specName: z.string().min(1)
    });

    try {
      const { specName } = generateDesignSchema.parse(args);
      
      this.logger.info(`Generating design for: ${specName}`);
      
      // Get current specification state
      const specState = await this.stateManager.getSpecificationState(specName);
      if (!specState) {
        throw new Error(`Specification '${specName}' not found`);
      }
      
      // Validate that requirements phase is complete
      if (specState.workflow.currentPhase !== Phase.REQUIREMENTS || specState.workflow.phases.requirements.status !== 'completed') {
        throw new Error(`Requirements phase must be completed before generating design`);
      }
      
      // Check if explicit approval is required
      const requirementsContent = await this.fileManager.readFile(`specs/${specName}/requirements.md`);
      const approvalValidation = await this.workflowEngine.validatePhaseTransitionApproval(
        specName,
        Phase.REQUIREMENTS,
        Phase.DESIGN
      );
      
      if (!approvalValidation.valid && approvalValidation.requiresApproval) {
        // Request approval for phase transition
        const approvalRequest = await this.workflowEngine.requestApproval(
          specName,
          Phase.REQUIREMENTS,
          Phase.DESIGN,
          requirementsContent,
          this.config.defaultAuthor
        );
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              requiresApproval: true,
              approvalRequest,
              message: `Phase transition requires approval. Please review the requirements document and provide explicit approval.`,
              guidance: `Before proceeding to the design phase, please confirm: Do the requirements look good? If so, we can move on to the design.`,
              nextSteps: `Use 'provideApproval' with approvalId '${approvalRequest.id}' to approve or reject this transition.`
            }, null, 2)
          }]
        };
      }
      
      // Requirements content already read above for approval validation
      const requirementsPath = `specs/${specName}/requirements.md`;
      
      // Transition to design phase
      const transitioned = await this.stateManager.transitionSpecificationPhase(specName, Phase.DESIGN, this.config.defaultAuthor);
      if (!transitioned) {
        throw new Error(`Failed to transition to design phase`);
      }
      
      // Generate design content using AI
      try {
        const designContent = this.generateDesignContent(specName, specState.metadata.description, requirementsContent);
        
        // Save design file
        const designPath = `specs/${specName}/design.md`;
        const specDirPath = path.join(this.config.dataDir, 'specs', specName);
        await fs.writeFile(path.join(specDirPath, 'design.md'), designContent, 'utf8');
        
        this.logger.info(`Design file created at ${designPath}`);
      } catch (contentError) {
        throw new Error(`Failed to create design file: ${contentError instanceof Error ? contentError.message : String(contentError)}`);
      }
      
      // Update workflow engine
      await this.workflowEngine.transitionToPhase(`${specName}-workflow`, WorkflowPhase.DESIGN, 'Design generated from requirements');
      
      this.logger.info(`Design generated successfully for: ${specName}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            specName,
            message: `Design generated successfully for '${specName}'`,
            data: {
              designFile: `specs/${specName}/design.md`,
              phase: Phase.DESIGN
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error(`Failed to generate design:`, error as Error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `Failed to generate design: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }

  private async handleCreateImplementationTasks(args: any) {
    const createTasksSchema = z.object({
      specName: z.string().min(1)
    });

    try {
      const { specName } = createTasksSchema.parse(args);
      
      this.logger.info(`Creating implementation tasks for: ${specName}`);
      
      // Get current specification state
      const specState = await this.stateManager.getSpecificationState(specName);
      if (!specState) {
        throw new Error(`Specification '${specName}' not found`);
      }
      
      // Validate that design phase is complete
      if (specState.workflow.currentPhase !== Phase.DESIGN || specState.workflow.phases.design.status !== 'completed') {
        throw new Error(`Design phase must be completed before creating implementation tasks`);
      }
      
      // Check if explicit approval is required
      const designContent = await this.fileManager.readFile(`specs/${specName}/design.md`);
      const approvalValidation = await this.workflowEngine.validatePhaseTransitionApproval(
        specName,
        Phase.DESIGN,
        Phase.TASKS
      );
      
      if (!approvalValidation.valid && approvalValidation.requiresApproval) {
        // Request approval for phase transition
        const approvalRequest = await this.workflowEngine.requestApproval(
          specName,
          Phase.DESIGN,
          Phase.TASKS,
          designContent,
          this.config.defaultAuthor
        );
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              requiresApproval: true,
              approvalRequest,
              message: `Phase transition requires approval. Please review the design document and provide explicit approval.`,
              guidance: `Before proceeding to the task creation, please confirm: Does the design look good? If so, we can move on to the implementation plan.`,
              nextSteps: `Use 'provideApproval' with approvalId '${approvalRequest.id}' to approve or reject this transition.`
            }, null, 2)
          }]
        };
      }
      
      // Design content already read above for approval validation
      const designPath = `specs/${specName}/design.md`;
      
      // Transition to tasks phase
      const transitioned = await this.stateManager.transitionSpecificationPhase(specName, Phase.TASKS, this.config.defaultAuthor);
      if (!transitioned) {
        throw new Error(`Failed to transition to tasks phase`);
      }
      
      // Generate tasks content using AI
      try {
        const tasksContent = this.generateTasksContent(specName, specState.metadata.description, designContent);
        
        // Save tasks file
        const tasksPath = `specs/${specName}/tasks.md`;
        const specDirPath = path.join(this.config.dataDir, 'specs', specName);
        await fs.writeFile(path.join(specDirPath, 'tasks.md'), tasksContent, 'utf8');
        
        this.logger.info(`Tasks file created at ${tasksPath}`);
      } catch (contentError) {
        throw new Error(`Failed to create tasks file: ${contentError instanceof Error ? contentError.message : String(contentError)}`);
      }
      
      // Update workflow engine
      await this.workflowEngine.transitionToPhase(`${specName}-workflow`, WorkflowPhase.IMPLEMENTATION, 'Implementation tasks created from design');
      
      this.logger.info(`Implementation tasks created successfully for: ${specName}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            specName,
            message: `Implementation tasks created successfully for '${specName}'`,
            data: {
              tasksFile: `specs/${specName}/tasks.md`,
              phase: Phase.TASKS
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error(`Failed to create implementation tasks:`, error as Error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `Failed to create implementation tasks: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }

  private async handleGetSpecStatus(args: any) {
    const getStatusSchema = z.object({
      specName: z.string().min(1)
    });

    try {
      const { specName } = getStatusSchema.parse(args);
      
      this.logger.info(`Getting status for: ${specName}`);
      
      // Get current specification state
      const specState = await this.stateManager.getSpecificationState(specName);
      if (!specState) {
        throw new Error(`Specification '${specName}' not found`);
      }
      
      // Get workflow history
      const workflowHistory = await this.stateManager.getWorkflowHistory(specName);
      
      // Get pending approval if any
      const pendingApproval = await this.workflowEngine.getPendingApproval(specName);
      
      // Determine next action with approval context
      let nextAction: string;
      let approvalGuidance: string | undefined;
      
      if (pendingApproval) {
        nextAction = `Pending approval for ${pendingApproval.toPhase} phase`;
        approvalGuidance = `Review the ${pendingApproval.fromPhase} document and provide explicit approval using 'provideApproval' with approvalId '${pendingApproval.id}' to proceed.`;
      } else {
        switch (specState.workflow.currentPhase) {
          case Phase.INIT:
            nextAction = 'Enter requirements phase';
            break;
          case Phase.REQUIREMENTS:
            if (specState.workflow.phases.requirements.status === 'completed') {
              nextAction = 'Generate design (requires approval)';
              approvalGuidance = 'Before generating design, ensure requirements are approved. Use "Do the requirements look good?" to confirm ground-truth.';
            } else {
              nextAction = 'Complete requirements gathering';
            }
            break;
          case Phase.DESIGN:
            if (specState.workflow.phases.design.status === 'completed') {
              nextAction = 'Create implementation tasks (requires approval)';
              approvalGuidance = 'Before creating tasks, ensure design is approved. Use "Does the design look good?" to confirm ground-truth.';
            } else {
              nextAction = 'Complete design document';
            }
            break;
          case Phase.TASKS:
            if (specState.workflow.phases.tasks.status === 'completed') {
              nextAction = 'Begin implementation (requires approval)';
              approvalGuidance = 'Before implementation, ensure tasks are approved. Use "Do the tasks look good?" to confirm ground-truth.';
            } else {
              nextAction = 'Complete task breakdown';
            }
            break;
          case Phase.COMPLETE:
            nextAction = 'Specification is complete';
            break;
          default:
            nextAction = 'Unknown';
        }
      }
      
      const statusResult = {
        success: true,
        specName,
        currentPhase: specState.workflow.currentPhase,
        progress: specState.workflow.phases,
        nextAction,
        approvalGuidance,
        pendingApproval,
        metadata: specState.metadata,
        files: specState.files,
        recentEvents: workflowHistory.slice(-5) // Last 5 events
      };
      
      this.logger.info(`Status retrieved for: ${specName}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(statusResult, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error(`Failed to get specification status:`, error as Error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `Failed to get specification status: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }

  private async handleUpdatePhaseProgress(args: any) {
    const updateProgressSchema = z.object({
      specName: z.string().min(1),
      phase: z.enum(['requirements', 'design', 'tasks']),
      completed: z.boolean()
    });

    try {
      const { specName, phase, completed } = updateProgressSchema.parse(args);
      
      this.logger.info(`Updating phase progress for ${specName}: ${phase} = ${completed}`);
      
      // Get current specification state
      const specState = await this.stateManager.getSpecificationState(specName);
      if (!specState) {
        throw new Error(`Specification '${specName}' not found`);
      }
      
      // Map phase string to Phase enum
      const phaseMap: Record<string, keyof typeof specState.workflow.phases> = {
        'requirements': 'requirements',
        'design': 'design',
        'tasks': 'tasks'
      };
      
      const phaseKey = phaseMap[phase];
      if (!phaseKey) {
        throw new Error(`Invalid phase: ${phase}`);
      }
      
      // Update phase status
      const updates: Partial<SpecificationState> = {
        workflow: {
          ...specState.workflow,
          phases: {
            ...specState.workflow.phases,
            [phaseKey]: {
              ...specState.workflow.phases[phaseKey],
              status: completed ? 'completed' : 'in_progress',
              completedAt: completed ? new Date() : undefined,
              approvedBy: completed ? this.config.defaultAuthor : undefined,
              approvalTimestamp: completed ? new Date() : undefined
            }
          }
        }
      };
      
      const updated = await this.stateManager.updateSpecificationState(specName, updates);
      if (!updated) {
        throw new Error(`Failed to update phase progress`);
      }
      
      // Record workflow event
      await this.stateManager.recordWorkflowEvent(specName, {
        id: `${specName}-${phase}-${completed ? 'completed' : 'updated'}-${Date.now()}`,
        timestamp: new Date(),
        specName,
        phase: phase as Phase,
        action: completed ? 'phase_completed' : 'phase_updated',
        details: { completed },
        userId: this.config.defaultAuthor
      });
      
      this.logger.info(`Phase progress updated successfully for ${specName}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            specName,
            phase,
            completed,
            message: `Phase '${phase}' ${completed ? 'completed' : 'updated'} for '${specName}'`
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error(`Failed to update phase progress:`, error as Error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `Failed to update phase progress: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }

  private async handleValidatePhaseTransition(args: any) {
    const validateTransitionSchema = z.object({
      specName: z.string().min(1),
      fromPhase: z.enum(['init', 'requirements', 'design', 'tasks']),
      toPhase: z.enum(['requirements', 'design', 'tasks', 'complete'])
    });

    try {
      const { specName, fromPhase, toPhase } = validateTransitionSchema.parse(args);
      
      this.logger.info(`Validating phase transition for ${specName}: ${fromPhase} -> ${toPhase}`);
      
      // Get current specification state
      const specState = await this.stateManager.getSpecificationState(specName);
      if (!specState) {
        throw new Error(`Specification '${specName}' not found`);
      }
      
      // Define valid transitions
      const validTransitions: Record<string, string[]> = {
        'init': ['requirements'],
        'requirements': ['design'],
        'design': ['tasks'],
        'tasks': ['complete']
      };
      
      // Check if transition is valid
      const isValidTransition = validTransitions[fromPhase]?.includes(toPhase) || false;
      
      if (!isValidTransition) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              valid: false,
              reason: `Invalid transition from '${fromPhase}' to '${toPhase}'`,
              allowedTransitions: validTransitions[fromPhase] || []
            }, null, 2)
          }]
        };
      }
      
      // Check if current phase is complete (for forward transitions)
      let requirements: string[] = [];
      if (fromPhase === 'requirements' && toPhase === 'design') {
        if (specState.workflow.phases.requirements.status !== 'completed') {
          requirements.push('Requirements phase must be completed');
        }
      } else if (fromPhase === 'design' && toPhase === 'tasks') {
        if (specState.workflow.phases.design.status !== 'completed') {
          requirements.push('Design phase must be completed');
        }
      } else if (fromPhase === 'tasks' && toPhase === 'complete') {
        if (specState.workflow.phases.tasks.status !== 'completed') {
          requirements.push('Tasks phase must be completed');
        }
      }
      
      // Validate that required files exist
      if (toPhase === 'design' && !specState.files.requirements.exists) {
        requirements.push('Requirements file must exist');
      } else if (toPhase === 'tasks' && !specState.files.design.exists) {
        requirements.push('Design file must exist');
      }
      
      const isValid = requirements.length === 0;
      
      this.logger.info(`Phase transition validation result: ${isValid}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            valid: isValid,
            reason: isValid ? `Transition from '${fromPhase}' to '${toPhase}' is valid` : `Transition blocked`,
            requirements: requirements.length > 0 ? requirements : undefined
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error(`Failed to validate phase transition:`, error as Error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            valid: false,
            reason: `Validation failed: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }

  private async handleSaveSpecificationFile(args: any) {
    const saveFileSchema = z.object({
      specName: z.string().min(1),
      fileName: z.enum(['requirements.md', 'design.md', 'tasks.md']),
      content: z.string()
    });

    try {
      const { specName, fileName, content } = saveFileSchema.parse(args);
      
      this.logger.info(`Saving file ${fileName} for specification: ${specName}`);
      
      // Get current specification state
      const specState = await this.stateManager.getSpecificationState(specName);
      if (!specState) {
        throw new Error(`Specification '${specName}' not found`);
      }
      
      // Determine workflow phase based on file type
      const workflowPhaseMap: Record<string, WorkflowPhase> = {
        'requirements.md': WorkflowPhase.REQUIREMENTS,
        'design.md': WorkflowPhase.DESIGN,
        'tasks.md': WorkflowPhase.IMPLEMENTATION
      };
      
      const phase = workflowPhaseMap[fileName];
      if (!phase) {
        throw new Error(`Invalid file name: ${fileName}`);
      }
      
      // Save file
      const filePath = `specs/${specName}/${fileName}`;
      const fileMetadata = await this.fileManager.updateFile(filePath, content);
      
      // Update specification state with file info
      const fileKey = fileName.replace('.md', '') as keyof typeof specState.files;
      const updates: Partial<SpecificationState> = {
        files: {
          ...specState.files,
          [fileKey]: {
            path: filePath,
            lastModified: fileMetadata.modifiedAt,
            size: fileMetadata.size,
            exists: true
          }
        }
      };
      
      await this.stateManager.updateSpecificationState(specName, updates);
      
      // Record workflow event
      await this.stateManager.recordWorkflowEvent(specName, {
        id: `${specName}-${fileName}-saved-${Date.now()}`,
        timestamp: new Date(),
        specName,
        phase: fileName.replace('.md', '') as Phase,
        action: 'file_saved',
        details: { fileName, size: fileMetadata.size },
        userId: this.config.defaultAuthor
      });
      
      // Check if approval is required for this phase (ground-truth progression)
      const phaseMap: Record<string, Phase> = {
        'requirements': Phase.REQUIREMENTS,
        'design': Phase.DESIGN,
        'tasks': Phase.TASKS
      };
      
      const phaseKey = fileName.replace('.md', '');
      const currentPhase = phaseMap[phaseKey];
      
      if (currentPhase) {
        const approvalRequirement = await this.workflowEngine.checkApprovalRequirement(
          specName,
          currentPhase,
          content
        );
        
        if (approvalRequirement.required) {
          this.logger.info(`File saved successfully: ${filePath}`);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                filePath,
                message: `File '${fileName}' saved successfully for '${specName}'`,
                metadata: fileMetadata,
                approvalRequired: true,
                approvalMessage: approvalRequirement.message,
                guidance: `Please review the ${phaseKey} document and provide explicit approval to proceed to the next phase.`,
                nextSteps: `Use 'checkApprovalRequirement' and 'requestApproval' to establish ground-truth before proceeding.`
              }, null, 2)
            }]
          };
        }
      }
      
      this.logger.info(`File saved successfully: ${filePath}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            filePath,
            message: `File '${fileName}' saved successfully for '${specName}'`,
            metadata: fileMetadata
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error(`Failed to save specification file:`, error as Error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `Failed to save file: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }

  private async handleLoadSpecificationFile(args: any) {
    const loadFileSchema = z.object({
      specName: z.string().min(1),
      fileName: z.enum(['requirements.md', 'design.md', 'tasks.md'])
    });

    try {
      const { specName, fileName } = loadFileSchema.parse(args);
      
      this.logger.info(`Loading file ${fileName} for specification: ${specName}`);
      
      // Get current specification state
      const specState = await this.stateManager.getSpecificationState(specName);
      if (!specState) {
        throw new Error(`Specification '${specName}' not found`);
      }
      
      // Load file content
      const filePath = `specs/${specName}/${fileName}`;
      const content = await this.fileManager.readFile(filePath);
      
      // Update file info in state
      const fileKey = fileName.replace('.md', '') as keyof typeof specState.files;
      const fileStats = await this.fileManager.listFiles(specName);
      const fileInfo = fileStats.find(f => f.path === filePath);
      
      if (fileInfo) {
        const updates: Partial<SpecificationState> = {
          files: {
            ...specState.files,
            [fileKey]: {
              path: filePath,
              lastModified: fileInfo.modifiedAt,
              size: fileInfo.size,
              exists: true
            }
          }
        };
        
        await this.stateManager.updateSpecificationState(specName, updates);
      }
      
      // Record workflow event
      await this.stateManager.recordWorkflowEvent(specName, {
        id: `${specName}-${fileName}-loaded-${Date.now()}`,
        timestamp: new Date(),
        specName,
        phase: fileName.replace('.md', '') as Phase,
        action: 'file_loaded',
        details: { fileName, size: fileInfo?.size },
        userId: this.config.defaultAuthor
      });
      
      this.logger.info(`File loaded successfully: ${filePath}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            filePath,
            content,
            message: `File '${fileName}' loaded successfully for '${specName}'`,
            metadata: fileInfo
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error(`Failed to load specification file:`, error as Error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `Failed to load file: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }

  private async handleApplyTemplate(args: any) {
    const applyTemplateSchema = z.object({
      templateName: z.enum(['requirements-template.md', 'design-template.md', 'tasks-template.md']),
      variables: z.record(z.any())
    });

    try {
      const { templateName, variables } = applyTemplateSchema.parse(args);
      
      this.logger.info(`Applying template: ${templateName}`);
      
      // Auto-populate required variables if missing
      const requiredVars: Record<string, string[]> = {
        'requirements-template.md': ['specName', 'description', 'author', 'date'],
        'design-template.md': ['specName', 'description', 'author', 'date'],
        'tasks-template.md': ['specName', 'description', 'author', 'date']
      };
      
      const required = requiredVars[templateName] || [];
      
      // Auto-populate missing variables with defaults
      for (const key of required) {
        if (!variables[key]) {
          switch (key) {
            case 'author':
              variables[key] = this.config.defaultAuthor;
              break;
            case 'date':
              variables[key] = new Date().toISOString().split('T')[0];
              break;
            case 'specName':
              // Try to extract from variables or use a default
              variables[key] = variables.specName || variables.project_name || 'unknown-spec';
              break;
            case 'description':
              // Try to extract from variables or use a default
              variables[key] = variables.description || variables.overview || 'No description provided';
              break;
            default:
              variables[key] = 'Not specified';
          }
        }
      }
      
      // Apply template
      const templateResult = await this.templateManager.processTemplate(templateName, {
        variables,
        phase: WorkflowPhase.REQUIREMENTS, // Default phase
        projectId: variables.specName || 'unknown',
        timestamp: new Date()
      });
      
      this.logger.info(`Template applied successfully: ${templateName}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            templateName,
            renderedContent: templateResult.content,
            message: `Template '${templateName}' applied successfully`,
            variables: variables
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error(`Failed to apply template:`, error as Error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `Failed to apply template: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }

  private async handleRequestApproval(args: any) {
    const requestApprovalSchema = z.object({
      specName: z.string().min(1),
      fromPhase: z.enum(['init', 'requirements', 'design', 'tasks']),
      toPhase: z.enum(['requirements', 'design', 'tasks', 'complete']),
      content: z.string(),
      requestedBy: z.string().min(1)
    });

    try {
      const { specName, fromPhase, toPhase, content, requestedBy } = requestApprovalSchema.parse(args);
      
      this.logger.info(`Requesting approval for ${specName}: ${fromPhase} -> ${toPhase}`);
      
      // Map string phases to Phase enum
      const phaseMap: Record<string, Phase> = {
        'init': Phase.INIT,
        'requirements': Phase.REQUIREMENTS,
        'design': Phase.DESIGN,
        'tasks': Phase.TASKS,
        'complete': Phase.COMPLETE
      };
      
      const mappedFromPhase = phaseMap[fromPhase];
      const mappedToPhase = phaseMap[toPhase];
      
      // Request approval through workflow engine
      const approvalRequest = await this.workflowEngine.requestApproval(
        specName,
        mappedFromPhase,
        mappedToPhase,
        content,
        requestedBy
      );
      
      this.logger.info(`Approval requested successfully: ${approvalRequest.id}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            approvalRequest,
            message: `Approval requested for ${specName} transition from ${fromPhase} to ${toPhase}`,
            guidance: `Please review the content and use 'provideApproval' to approve or reject this request.`
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error(`Failed to request approval:`, error as Error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `Failed to request approval: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }

  private async handleProvideApproval(args: any) {
    const provideApprovalSchema = z.object({
      specName: z.string().min(1),
      approvalId: z.string().min(1),
      approvedBy: z.string().min(1),
      approved: z.boolean(),
      comments: z.string().optional()
    });

    try {
      const { specName, approvalId, approvedBy, approved, comments } = provideApprovalSchema.parse(args);
      
      this.logger.info(`Providing approval for ${specName}: ${approved ? 'approved' : 'rejected'}`);
      
      // Provide approval through workflow engine
      const approvalRecord = await this.workflowEngine.provideApproval(
        specName,
        approvalId,
        approvedBy,
        approved,
        comments
      );
      
      this.logger.info(`Approval provided successfully: ${approvalRecord.id}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            approvalRecord,
            message: `Approval ${approved ? 'approved' : 'rejected'} for ${specName}`,
            nextSteps: approved 
              ? `The ${approvalRecord.phase} phase has been approved. You can now proceed to the next phase.`
              : `The ${approvalRecord.phase} phase was rejected. Please make necessary changes and request approval again.`
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error(`Failed to provide approval:`, error as Error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `Failed to provide approval: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }

  private async handleGetPendingApproval(args: any) {
    const getPendingApprovalSchema = z.object({
      specName: z.string().min(1)
    });

    try {
      const { specName } = getPendingApprovalSchema.parse(args);
      
      this.logger.info(`Getting pending approval for ${specName}`);
      
      // Get pending approval through workflow engine
      const pendingApproval = await this.workflowEngine.getPendingApproval(specName);
      
      if (!pendingApproval) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              pendingApproval: null,
              message: `No pending approval found for ${specName}`
            }, null, 2)
          }]
        };
      }
      
      this.logger.info(`Pending approval found: ${pendingApproval.id}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            pendingApproval,
            message: `Pending approval found for ${specName}`,
            guidance: `Use 'provideApproval' with approvalId '${pendingApproval.id}' to approve or reject this request.`
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error(`Failed to get pending approval:`, error as Error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `Failed to get pending approval: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }

  private async handleCheckApprovalRequirement(args: any) {
    const checkApprovalSchema = z.object({
      specName: z.string().min(1),
      phase: z.enum(['requirements', 'design', 'tasks']),
      content: z.string()
    });

    try {
      const { specName, phase, content } = checkApprovalSchema.parse(args);
      
      this.logger.info(`Checking approval requirement for ${specName}: ${phase}`);
      
      // Map string phase to Phase enum
      const phaseMap: Record<string, Phase> = {
        'requirements': Phase.REQUIREMENTS,
        'design': Phase.DESIGN,
        'tasks': Phase.TASKS
      };
      
      const mappedPhase = phaseMap[phase];
      
      // Check approval requirement through workflow engine
      const requirement = await this.workflowEngine.checkApprovalRequirement(
        specName,
        mappedPhase,
        content
      );
      
      this.logger.info(`Approval requirement checked: ${requirement.required}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            required: requirement.required,
            message: requirement.message || `Approval ${requirement.required ? 'is' : 'is not'} required for ${phase} phase`,
            guidance: requirement.required 
              ? `Please review the ${phase} document and provide explicit approval using 'provideApproval'.`
              : `You can proceed to the next phase without explicit approval.`
          }, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error(`Failed to check approval requirement:`, error as Error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `Failed to check approval requirement: ${error instanceof Error ? error.message : String(error)}`
          }, null, 2)
        }]
      };
    }
  }

  private generateRequirementsContent(specName: string, description: string): string {
    return `# Requirements Specification: ${specName}

## Overview

${description}

## User Stories

### Primary User Story
As a user, I want to use ${specName} so that I can benefit from the described functionality.

**Acceptance Criteria (EARS format):**
- WHEN the user interacts with the system THEN the system SHALL respond appropriately
- IF the user provides valid input THEN the system SHALL process it successfully
- WHEN an error occurs THEN the system SHALL provide clear feedback

## Functional Requirements

### Core Functionality
1. **Primary Feature**: The system SHALL implement the core functionality as described
2. **User Interface**: The system SHALL provide an intuitive user interface
3. **Data Management**: The system SHALL handle data securely and efficiently

## Non-Functional Requirements

### Performance
- The system SHALL respond to user actions within 2 seconds
- The system SHALL handle concurrent users appropriately

### Security
- The system SHALL protect user data according to best practices
- The system SHALL validate all input data

### Usability
- The system SHALL be accessible to users with varying technical expertise
- The system SHALL provide helpful error messages

## Technical Requirements

### Integration
- The system SHALL integrate with existing systems as needed
- The system SHALL use standard protocols and formats

### Data
- The system SHALL store data persistently
- The system SHALL ensure data integrity

## Dependencies

### Internal Dependencies
- To be defined during design phase

### External Dependencies
- To be identified based on technical requirements

## Success Criteria

- All functional requirements are met
- System performs within specified parameters
- User acceptance criteria are satisfied
- System is ready for production deployment

---

**Status**: Draft  
**Phase**: Requirements  
**Created**: ${new Date().toISOString().split('T')[0]}`;
  }

  private generateDesignContent(specName: string, description: string, requirementsContent: string): string {
    return `# Design Document: ${specName}

## Overview

${description}

Based on the requirements analysis, this design document outlines the system architecture and implementation approach.

## Architecture

### System Architecture
The system will follow a modular architecture with clear separation of concerns:

- **Presentation Layer**: User interface and API endpoints
- **Business Logic Layer**: Core functionality and business rules
- **Data Access Layer**: Database interactions and data management
- **Integration Layer**: External system interfaces

### Component Interactions
Components will communicate through well-defined interfaces, ensuring loose coupling and maintainability.

## Key Design Decisions

### Technology Stack
- Backend: Modern framework with strong ecosystem support
- Database: Appropriate database technology based on data requirements
- API: RESTful API design following best practices

### Data Models
Core entities will be modeled to support the functional requirements while ensuring data integrity and performance.

### Security Architecture
- Authentication and authorization mechanisms
- Input validation and sanitization
- Secure data storage and transmission

## Implementation Strategy

### Phase 1: Core Infrastructure
- Set up project structure and build pipeline
- Implement basic data models and database schema
- Create API foundation and authentication

### Phase 2: Core Features
- Implement primary functionality as defined in requirements
- Add business logic and validation rules
- Create user interfaces

### Phase 3: Integration and Polish
- Integrate with external systems as needed
- Performance optimization and testing
- Documentation and deployment preparation

## Error Handling

### Error Categories
1. **Validation Errors**: Invalid input data
2. **Business Logic Errors**: Rule violations
3. **System Errors**: Infrastructure failures
4. **Integration Errors**: External system issues

### Recovery Strategies
- Graceful error handling with user-friendly messages
- Logging and monitoring for troubleshooting
- Retry mechanisms for transient failures

## Testing Strategy

### Unit Testing
- Comprehensive unit tests for business logic
- Test coverage requirements and quality gates

### Integration Testing
- API endpoint testing
- Database integration testing
- External system integration testing

### End-to-End Testing
- Complete user workflow testing
- Performance and load testing

## Dependencies

### Internal Dependencies
- Core system components as defined in architecture

### External Dependencies
- Third-party libraries and frameworks
- External APIs and services
- Infrastructure components

---

**Status**: Draft  
**Phase**: Design  
**Created**: ${new Date().toISOString().split('T')[0]}`;
  }

  private generateTasksContent(specName: string, description: string, designContent: string): string {
    return `# Implementation Tasks: ${specName}

## Overview

Implementation plan for ${description}

This document breaks down the implementation into actionable tasks based on the design document.

## Task Breakdown

### Phase 1: Project Foundation
- [ ] 1. Set up project structure and development environment
  - Initialize project repository and structure
  - Configure build tools and dependency management
  - Set up development environment and tooling
  - _Requirements: Development environment setup_

- [ ] 2. Implement core data models and database schema
  - Design and create database schema
  - Implement data models and entity relationships
  - Set up database migrations and versioning
  - _Requirements: Data persistence and integrity_

### Phase 2: Core Implementation
- [ ] 3. Implement business logic layer
  - Create core service classes and business rules
  - Implement validation and error handling
  - Add logging and monitoring infrastructure
  - _Requirements: Core functionality and validation_

- [ ] 4. Develop API endpoints and interfaces
  - Design and implement REST API endpoints
  - Add authentication and authorization
  - Implement request/response handling
  - _Requirements: External interfaces and security_

### Phase 3: Integration and Testing
- [ ] 5. Implement user interface components
  - Create user interface layouts and components
  - Implement user interaction handlers
  - Add client-side validation and feedback
  - _Requirements: User experience and interface_

- [ ] 6. Integration testing and validation
  - Write comprehensive unit tests
  - Implement integration test suites
  - Perform end-to-end testing scenarios
  - _Requirements: Quality assurance and reliability_

### Phase 4: Deployment and Documentation
- [ ] 7. Prepare production deployment
  - Configure production environment
  - Set up deployment pipeline and automation
  - Implement monitoring and logging
  - _Requirements: Production readiness_

- [ ] 8. Documentation and handover
  - Create user documentation and guides
  - Document API specifications
  - Prepare maintenance and support documentation
  - _Requirements: Documentation and support_

## Implementation Guidelines

### Development Standards
- Follow established coding standards and best practices
- Implement comprehensive error handling
- Ensure code is well-documented and maintainable

### Testing Requirements
- Minimum 80% test coverage for business logic
- All API endpoints must have integration tests
- Critical user paths must have end-to-end tests

### Quality Gates
- All tests must pass before deployment
- Code review approval required for all changes
- Performance benchmarks must be met

## Success Criteria

- All functional requirements are implemented and tested
- System performs within specified performance parameters
- All quality gates and testing requirements are met
- System is successfully deployed to production environment

## Risk Mitigation

### Technical Risks
- Regular code reviews and pair programming
- Incremental development and testing approach
- Continuous integration and automated testing

### Schedule Risks
- Prioritize core functionality first
- Plan for iterative development cycles
- Maintain buffer time for unforeseen challenges

---

**Status**: Draft  
**Phase**: Tasks  
**Created**: ${new Date().toISOString().split('T')[0]}`;
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info('Specster MCP Server started and connected');
  }
}

// Start the server
const server = new SpecsterMCPServer();
server.run().catch((error) => {
  console.error('Failed to start Specster MCP Server:', error);
  process.exit(1);
});