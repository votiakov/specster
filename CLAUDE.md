# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Specster is a spec-driven development methodology that implements a three-phase workflow using Claude Code's native capabilities:

1. **Requirements Phase**: Create structured requirements using EARS format
2. **Design Phase**: Generate comprehensive design documents with research integration
3. **Implementation Phase**: Break down features into executable tasks

The system leverages Claude Code's MCP servers, custom commands, and hooks to orchestrate the workflow.

## Development Commands

Since this is a conceptual project without implemented code yet, standard development commands will be established once the implementation begins. The project will likely use:

- Node.js/TypeScript for the MCP server implementation
- Standard testing frameworks (Jest, etc.)
- Build tools appropriate for the chosen stack

## Architecture

### Core Components

1. **MCP Server (specster-server)**: Central workflow orchestrator
   - Manages phase state transitions
   - Handles specification file synchronization
   - Enforces workflow rules

2. **Custom Commands**: Claude Code slash commands
   - `/spec-init` - Initialize new specification
   - `/spec-requirements` - Enter requirements phase
   - `/spec-design` - Generate design documentation
   - `/spec-tasks` - Create implementation tasks
   - `/spec-status` - Check specification status

3. **Claude Code Hooks**: Quality automation
   - PreToolUse - Validation before operations
   - PostToolUse - State updates after operations
   - Notification - Progress tracking

### File System Organization

```
.specster/
├── specs/
│   └── {feature-name}/
│       ├── requirements.md
│       ├── design.md
│       └── tasks.md
├── config/
│   ├── mcp-config.json
│   └── workflow-rules.yml
├── templates/
│   ├── requirements-template.md
│   ├── design-template.md
│   └── tasks-template.md
└── state/
    └── workflow-state.json
```

## Workflow Methodology

### Phase 1: Requirements (EARS Format)
- Create user stories: "As a [role], I want [feature], so that [benefit]"
- Write acceptance criteria using EARS syntax:
  - `WHEN [event] THEN [system] SHALL [response]`
  - `IF [precondition] THEN [system] SHALL [response]`
- Explicit approval required before proceeding

### Phase 2: Design Documentation
- Conduct research to inform design decisions
- Create comprehensive design with architecture diagrams
- Include components, interfaces, data models, error handling
- Integrate research findings directly into design decisions

### Phase 3: Implementation Tasks
- Break down into actionable coding tasks
- Format as numbered checkbox lists (max two levels)
- Each task references specific requirements
- Focus only on code-related activities

## Key Principles

1. **Sequential Progression**: Never skip phases
2. **Explicit Approval**: Required after each document
3. **Ground-Truth Establishment**: User establishes correctness at each phase
4. **Research-Informed Design**: Integrate findings into design decisions
5. **Actionable Implementation**: Tasks must be executable by coding agents

## Implementation Status

This project is currently in the conceptual/documentation phase. The actual MCP server, custom commands, and hooks have not been implemented yet. The architecture documents serve as the blueprint for future implementation.

## Working with Specs

When working with this project:
- Always read requirements.md, design.md, and tasks.md before implementation
- Focus on ONE task at a time
- Verify implementation against specified requirements
- Stop after completing each task for review
- Don't automatically proceed to the next task

## File References

- `specster-claude-architecture.md` - Detailed system architecture and component design
- `workflow.md` - Comprehensive workflow methodology guide
- `.claude/settings.local.json` - Claude Code permissions configuration