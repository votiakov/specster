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
      storagePath: this.config.dataDir,
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
      approvalTimeout: 3600000 // 1 hour
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
      
      // Create spec directory structure
      const specDir = `.specster/specs/${name}`;
      await this.fileManager.createFile(`${specDir}/spec.json`, JSON.stringify(specState, null, 2), WorkflowPhase.REQUIREMENTS);
      
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
              specDir: specDir
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
      
      // Apply requirements template
      const templateResult = await this.templateManager.processTemplate('requirements-template.md', {
        variables: {
          specName,
          description: specState.metadata.description,
          author: specState.metadata.author,
          date: new Date().toISOString().split('T')[0]
        },
        phase: WorkflowPhase.REQUIREMENTS,
        projectId: specName,
        timestamp: new Date()
      });
      
      // Save requirements file
      const requirementsPath = `.specster/specs/${specName}/requirements.md`;
      await this.fileManager.createFile(requirementsPath, templateResult.content, WorkflowPhase.REQUIREMENTS);
      
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
              requirementsFile: requirementsPath,
              template: templateResult.content.substring(0, 200) + '...'
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
      const requirementsContent = await this.fileManager.readFile(`.specster/specs/${specName}/requirements.md`);
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
      const requirementsPath = `.specster/specs/${specName}/requirements.md`;
      
      // Transition to design phase
      const transitioned = await this.stateManager.transitionSpecificationPhase(specName, Phase.DESIGN, this.config.defaultAuthor);
      if (!transitioned) {
        throw new Error(`Failed to transition to design phase`);
      }
      
      // Apply design template with requirements context
      const templateResult = await this.templateManager.processTemplate('design-template.md', {
        variables: {
          specName,
          description: specState.metadata.description,
          author: specState.metadata.author,
          date: new Date().toISOString().split('T')[0],
          requirements: requirementsContent
        },
        phase: WorkflowPhase.DESIGN,
        projectId: specName,
        timestamp: new Date()
      });
      
      // Save design file
      const designPath = `.specster/specs/${specName}/design.md`;
      await this.fileManager.createFile(designPath, templateResult.content, WorkflowPhase.DESIGN);
      
      // Update workflow engine
      await this.workflowEngine.transitionToPhase(`${specName}-workflow`, WorkflowPhase.DESIGN, 'Design generated from requirements');
      
      this.logger.info(`Design generated successfully for: ${specName}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            specName,
            design: templateResult.content,
            message: `Design generated successfully for '${specName}'`,
            data: {
              designFile: designPath,
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
      const designContent = await this.fileManager.readFile(`.specster/specs/${specName}/design.md`);
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
      const designPath = `.specster/specs/${specName}/design.md`;
      
      // Transition to tasks phase
      const transitioned = await this.stateManager.transitionSpecificationPhase(specName, Phase.TASKS, this.config.defaultAuthor);
      if (!transitioned) {
        throw new Error(`Failed to transition to tasks phase`);
      }
      
      // Apply tasks template with design context
      const templateResult = await this.templateManager.processTemplate('tasks-template.md', {
        variables: {
          specName,
          description: specState.metadata.description,
          author: specState.metadata.author,
          date: new Date().toISOString().split('T')[0],
          design: designContent
        },
        phase: WorkflowPhase.IMPLEMENTATION,
        projectId: specName,
        timestamp: new Date()
      });
      
      // Save tasks file
      const tasksPath = `.specster/specs/${specName}/tasks.md`;
      await this.fileManager.createFile(tasksPath, templateResult.content, WorkflowPhase.IMPLEMENTATION);
      
      // Update workflow engine
      await this.workflowEngine.transitionToPhase(`${specName}-workflow`, WorkflowPhase.IMPLEMENTATION, 'Implementation tasks created from design');
      
      this.logger.info(`Implementation tasks created successfully for: ${specName}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            specName,
            tasks: templateResult.content,
            message: `Implementation tasks created successfully for '${specName}'`,
            data: {
              tasksFile: tasksPath,
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
      const filePath = `.specster/specs/${specName}/${fileName}`;
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
      const filePath = `.specster/specs/${specName}/${fileName}`;
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