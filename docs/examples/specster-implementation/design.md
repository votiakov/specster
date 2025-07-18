# Design Document: Specster Implementation

## Overview

Specster implements a spec-driven development methodology using Claude Code's native capabilities. The system orchestrates a three-phase workflow (requirements, design, tasks) through an MCP server for core logic, custom slash commands for user interaction, and hooks for automation and validation.

## Architecture

### System Architecture

```mermaid
graph TB
    User[Developer] --> CC[Claude Code CLI]
    CC --> Commands[Custom Slash Commands]
    CC --> MCP[Specster MCP Server]
    CC --> Hooks[Claude Code Hooks]
    
    subgraph "Specster MCP Server"
        WE[Workflow Engine]
        SM[State Manager]
        FM[File Manager]
        TM[Template Manager]
        VE[Validation Engine]
    end
    
    subgraph "Custom Slash Commands"
        SI[/spec-init]
        SR[/spec-requirements]
        SD[/spec-design]
        ST[/spec-tasks]
        SS[/spec-status]
    end
    
    subgraph "Claude Code Hooks"
        PTU[PreToolUse]
        POTU[PostToolUse]
        NOTIF[Notification]
        STOP[Stop]
    end
    
    subgraph "File System"
        Specs[.specster/specs/]
        State[.specster/state/]
        Templates[.specster/templates/]
        Config[.specster/config/]
    end
    
    Commands --> MCP
    Hooks --> MCP
    MCP --> Specs
    MCP --> State
    MCP --> Templates
    MCP --> Config
    
    classDef primary fill:#e1f5fe
    classDef secondary fill:#f3e5f5
    classDef storage fill:#e8f5e8
    
    class MCP,WE,SM,FM,TM,VE primary
    class Commands,Hooks secondary
    class Specs,State,Templates,Config storage
```

### Component Interactions

The system follows a clear interaction pattern:

1. **User Interaction**: Developer uses slash commands (`/spec-init`, `/spec-requirements`, etc.)
2. **Command Processing**: Custom commands invoke MCP server tools
3. **Workflow Logic**: MCP server manages phase transitions and state
4. **Automation**: Hooks provide validation and automatic updates
5. **Persistence**: All state and specifications stored in file system

## Core Components

### 1. Specster MCP Server

The central orchestrator implemented as a Node.js MCP server.

**Key Responsibilities:**
- Manage workflow state and phase transitions
- Validate phase progression rules
- Generate specifications from templates
- Coordinate with file system operations
- Provide tools for custom commands

**MCP Tools Provided:**
```typescript
interface SpecsterMCPTools {
  // Core workflow management
  initializeSpec(name: string, description: string): SpecResult
  enterRequirementsPhase(specName: string): PhaseResult
  generateDesign(specName: string): DesignResult
  createImplementationTasks(specName: string): TaskResult
  
  // State management
  getSpecStatus(specName: string): StatusResult
  updatePhaseProgress(specName: string, phase: Phase, complete: boolean): ProgressResult
  validatePhaseTransition(specName: string, fromPhase: Phase, toPhase: Phase): ValidationResult
  
  // File operations
  saveSpecificationFile(specName: string, fileName: string, content: string): SaveResult
  loadSpecificationFile(specName: string, fileName: string): LoadResult
  applyTemplate(templateName: string, variables: Record<string, string>): TemplateResult
}
```

**State Management:**
```typescript
interface SpecsterState {
  activeSpecs: Map<string, SpecState>
  currentSession: SessionInfo
  workflowHistory: WorkflowEvent[]
  validationRules: ValidationRule[]
}

interface SpecState {
  name: string
  description: string
  currentPhase: Phase
  phases: {
    requirements: PhaseStatus
    design: PhaseStatus
    tasks: PhaseStatus
  }
  createdAt: Date
  lastModified: Date
}

enum Phase {
  INIT = "init",
  REQUIREMENTS = "requirements",
  DESIGN = "design", 
  TASKS = "tasks",
  COMPLETE = "complete"
}
```

### 2. Custom Slash Commands

Claude Code slash commands stored in `.claude/commands/` directory.

**Command Structure:**
```markdown
<!-- .claude/commands/spec-init.md -->
# Initialize New Specification

I'll help you initialize a new specification for spec-driven development.

<mcp_call server="specster-server" tool="initializeSpec">
{
  "name": "{{ARGS[0]}}",
  "description": "{{ARGS[1]}}"
}
</mcp_call>

Let's start with the requirements phase...
```

**Available Commands:**
- `/spec-init <name> <description>` - Initialize new specification
- `/spec-requirements <name>` - Enter requirements gathering phase
- `/spec-design <name>` - Generate design documentation
- `/spec-tasks <name>` - Create implementation tasks
- `/spec-status [name]` - Check specification status

### 3. Claude Code Hooks Integration

Hooks provide automation and validation throughout the workflow.

**Hook Configuration:**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__specster-server__.*",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.specster/hooks/validate-spec-operation.js"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "mcp__specster-server__.*",
        "hooks": [
          {
            "type": "command", 
            "command": "node ~/.specster/hooks/update-spec-state.js"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.specster/hooks/track-progress.js"
          }
        ]
      }
    ]
  }
}
```

**Hook Scripts:**
- `validate-spec-operation.js` - Validates MCP tool calls before execution
- `update-spec-state.js` - Updates state after successful operations
- `track-progress.js` - Logs progress and sends notifications

### 4. File System Organization

```
.specster/
├── specs/
│   └── {feature-name}/
│       ├── requirements.md      # EARS format requirements
│       ├── design.md           # Architecture and design decisions
│       ├── tasks.md            # Implementation task breakdown
│       └── .spec-state.json    # Phase and progress tracking
├── state/
│   ├── workflow-state.json     # Global workflow state
│   └── session-history.json    # Session history tracking
├── templates/
│   ├── requirements-template.md
│   ├── design-template.md
│   └── tasks-template.md
├── config/
│   ├── mcp-config.json         # MCP server configuration
│   ├── workflow-rules.json     # Phase transition rules
│   └── validation-rules.json   # Content validation rules
└── hooks/
    ├── validate-spec-operation.js
    ├── update-spec-state.js
    └── track-progress.js
```

## Data Models

### Specification State Model

```typescript
interface SpecificationState {
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

interface PhaseInfo {
  status: 'pending' | 'in_progress' | 'completed'
  startedAt?: Date
  completedAt?: Date
  approvedBy?: string
  approvalTimestamp?: Date
}

interface ApprovalInfo {
  phase: Phase
  approvedBy: string
  timestamp: Date
  comments?: string
}
```

### MCP Server Configuration

```json
{
  "mcpServers": {
    "specster-server": {
      "command": "node",
      "args": [".specster/mcp-server/dist/server.js"],
      "env": {
        "SPECSTER_DATA_DIR": ".specster",
        "SPECSTER_TEMPLATES_DIR": ".specster/templates"
      }
    }
  }
}
```

## Implementation Details

### Phase Transition Logic

```typescript
class WorkflowEngine {
  private validTransitions: Map<Phase, Phase[]> = new Map([
    [Phase.INIT, [Phase.REQUIREMENTS]],
    [Phase.REQUIREMENTS, [Phase.DESIGN]],
    [Phase.DESIGN, [Phase.TASKS]],
    [Phase.TASKS, [Phase.COMPLETE]]
  ])

  validateTransition(currentPhase: Phase, targetPhase: Phase): boolean {
    const allowedNext = this.validTransitions.get(currentPhase) || []
    return allowedNext.includes(targetPhase)
  }

  requiresApproval(phase: Phase): boolean {
    return [Phase.REQUIREMENTS, Phase.DESIGN, Phase.TASKS].includes(phase)
  }
}
```

### Template System

```typescript
class TemplateManager {
  async renderTemplate(templateName: string, variables: Record<string, any>): Promise<string> {
    const template = await this.loadTemplate(templateName)
    return this.processTemplate(template, variables)
  }

  private processTemplate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] || match
    })
  }
}
```

### Hook Integration

```javascript
// validate-spec-operation.js
const input = JSON.parse(process.stdin.read())

if (input.tool_name.startsWith('mcp__specster-server__')) {
  const operation = input.tool_name.split('__')[2]
  const validation = validateOperation(operation, input.tool_input)
  
  if (!validation.valid) {
    console.error(validation.message)
    process.exit(2) // Block the operation
  }
}

process.exit(0) // Allow the operation
```

## Error Handling

### Phase Transition Errors

```typescript
class PhaseTransitionError extends Error {
  constructor(
    public currentPhase: Phase,
    public targetPhase: Phase,
    public reason: string
  ) {
    super(`Cannot transition from ${currentPhase} to ${targetPhase}: ${reason}`)
  }
}
```

### Hook Error Handling

```javascript
// Error handling in hooks
try {
  const result = processHookInput(input)
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: false
  }))
} catch (error) {
  console.error(error.message)
  process.exit(1) // Non-blocking error
}
```

## Security Considerations

### Input Validation

```typescript
class ValidationEngine {
  validateSpecName(name: string): boolean {
    // Alphanumeric and hyphens only, no path traversal
    return /^[a-zA-Z0-9-]+$/.test(name) && !name.includes('..')
  }

  validateFilePath(path: string): boolean {
    // Must be within .specster directory
    return path.startsWith('.specster/') && !path.includes('..')
  }
}
```

### Hook Security

```javascript
// Secure hook implementation
const fs = require('fs')
const path = require('path')

function validateFilePath(filePath) {
  const resolvedPath = path.resolve(filePath)
  const allowedDir = path.resolve('.specster')
  return resolvedPath.startsWith(allowedDir)
}
```

## Performance Considerations

### Caching Strategy

```typescript
class StateManager {
  private cache = new Map<string, SpecState>()
  private cacheExpiry = 5 * 60 * 1000 // 5 minutes

  async getSpecState(specName: string): Promise<SpecState> {
    const cached = this.cache.get(specName)
    if (cached && Date.now() - cached.lastAccessed < this.cacheExpiry) {
      return cached
    }

    const state = await this.loadStateFromFile(specName)
    this.cache.set(specName, state)
    return state
  }
}
```

### Async Operations

```typescript
// Non-blocking file operations
async function saveSpecificationAsync(specName: string, content: string): Promise<void> {
  await fs.promises.writeFile(
    `.specster/specs/${specName}/requirements.md`,
    content,
    'utf8'
  )
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('WorkflowEngine', () => {
  test('validates phase transitions correctly', () => {
    const engine = new WorkflowEngine()
    expect(engine.validateTransition(Phase.INIT, Phase.REQUIREMENTS)).toBe(true)
    expect(engine.validateTransition(Phase.INIT, Phase.DESIGN)).toBe(false)
  })
})
```

### Integration Tests

```typescript
describe('MCP Server Integration', () => {
  test('initializes specification correctly', async () => {
    const result = await mcpClient.call('initializeSpec', {
      name: 'test-spec',
      description: 'Test specification'
    })
    expect(result.success).toBe(true)
    expect(fs.existsSync('.specster/specs/test-spec')).toBe(true)
  })
})
```

### Hook Tests

```javascript
// Test hook validation
const mockInput = {
  tool_name: 'mcp__specster-server__initializeSpec',
  tool_input: { name: 'test-spec', description: 'Test' }
}

const result = validateSpecOperation(mockInput)
expect(result.valid).toBe(true)
```

## Deployment and Configuration

### MCP Server Installation

```bash
# Install MCP server
npm install -g @specster/mcp-server

# Configure Claude Code
claude mcp add specster-server node ~/.specster/mcp-server/dist/server.js
```

### Hook Installation

```bash
# Copy hook scripts
cp hooks/* ~/.specster/hooks/

# Update Claude Code settings
claude config set hooks.PreToolUse.0.matcher "mcp__specster-server__.*"
claude config set hooks.PreToolUse.0.hooks.0.command "node ~/.specster/hooks/validate-spec-operation.js"
```

## Future Enhancements

### Advanced Features

1. **Real-time Collaboration**: Multiple developers working on same spec
2. **Version Control Integration**: Git hooks for automatic commits
3. **Template Customization**: User-defined templates
4. **Analytics Dashboard**: Progress tracking and metrics
5. **Plugin System**: Extensible architecture for custom tools

### Performance Optimizations

1. **Lazy Loading**: Load specifications on demand
2. **Background Processing**: Async template rendering
3. **Incremental Updates**: Only update changed files
4. **Compression**: Compress state files for large specifications

This design leverages Claude Code's verified capabilities while providing a robust, extensible foundation for spec-driven development workflows.