# 🚀 Specster - Spec-Driven Development with Claude Code

Transform rough ideas into well-defined, implementable features using a structured three-phase workflow. Specster integrates seamlessly with Claude Code to provide guided requirements gathering, research-informed design, and granular task breakdown.

## ✨ Key Benefits

- **🎯 Structured Workflow**: No more jumping straight to coding - ensures proper planning
- **📋 Quality Requirements**: EARS format ensures testable, specific requirements
- **🔬 Research-Informed Design**: System prompts for architectural research and decision rationale  
- **✅ Actionable Tasks**: Breaks complex features into 2-4 hour implementation chunks
- **🔒 Approval Gates**: Explicit checkpoints prevent assumptions and ensure alignment
- **🔗 Traceability**: Every task links back to specific requirements
- **💾 State Persistence**: Resume work across sessions without losing progress

## 🚀 Quick Installation

### One-Command Remote Installation

```bash
curl -fsSL https://raw.githubusercontent.com/votiakov/specster/main/install.sh | bash
```

**Local Installation** (if you've cloned the repository):

```bash
git clone https://github.com/votiakov/specster.git
cd specster
./install.sh
```

That's it! The installer will:
- ✅ **Auto-detect** installation context (remote vs local)
- ✅ **Download repository** automatically (remote mode)
- ✅ Check prerequisites (Node.js, npm, Claude Code)
- ✅ Build the MCP server
- ✅ Configure Claude Code integration
- ✅ Set up templates and validation hooks
- ✅ Run tests to verify installation

## 📋 Prerequisites

Before installation, ensure you have:

- **Node.js** v16+ and **npm** ([Download here](https://nodejs.org/))
- **Claude Code CLI** ([Install guide](https://docs.anthropic.com/en/docs/claude-code/quickstart))
- **curl** or **wget** (for remote installation - usually pre-installed)
- **unzip** (for remote installation - usually pre-installed)

### Installing Prerequisites

**Node.js:**
```bash
# macOS (using Homebrew)
brew install node

# Ubuntu/Debian
sudo apt install nodejs npm

# Windows
winget install OpenJS.NodeJS
# Or download from https://nodejs.org/
```

**Claude Code CLI:**
```bash
npm install -g @anthropic-ai/claude-code
```

## 🎯 Getting Started

### Step 1: Start Claude Code
```bash
claude
```

### Step 2: Initialize Your First Specification
```bash
> /spec-init shopping-cart "Enable users to manage items in a shopping cart"
```

**Output:**
```
✅ Specification 'shopping-cart' initialized successfully!
📁 Created directory: .specster/specs/shopping-cart/
📄 Files created:
   - requirements.md (from template)
   - design.md (from template) 
   - tasks.md (from template)
🔄 Current Phase: init
▶️  Next Step: Run /spec-requirements shopping-cart
```

### Step 3: Work Through the Three-Phase Workflow

#### Phase 1: Requirements Gathering
```bash
> /spec-requirements shopping-cart
```

**What happens:**
- Generates structured requirements using EARS format
- Creates specific, testable acceptance criteria
- Covers edge cases and error scenarios
- **Approval Gate**: "Do the requirements look good?"

**Example Output:**
```markdown
# Requirements Specification: Shopping Cart

## User Stories

### Story 1: Add Items to Cart
As a customer, I want to add products to my shopping cart, so that I can purchase multiple items.

**Acceptance Criteria (EARS format):**
- WHEN user clicks "Add to Cart" THEN system SHALL add item to cart
- IF product is out of stock THEN system SHALL disable "Add to Cart" button
- WHEN item already exists in cart THEN system SHALL increase quantity
```

#### Phase 2: Design Documentation
```bash
> /spec-design shopping-cart
```

**What happens:**
- Creates comprehensive technical design
- Includes research findings and architectural decisions
- Defines component interfaces and data models
- **Approval Gate**: "Does the design look good?"

**Example Output:**
```markdown
# Design Document: Shopping Cart

## Research Integration

### Research Question 1: Cart Persistence Strategy
**Research Findings**: Analysis of Amazon, Shopify shows client-first approach with server sync
**Design Decision**: Implement localStorage with background server synchronization

## Architecture
[System diagrams and component details]
```

#### Phase 3: Implementation Tasks
```bash
> /spec-tasks shopping-cart
```

**What happens:**
- Breaks design into actionable 2-4 hour tasks
- Links each task to specific requirements
- Includes clear acceptance criteria and quality gates
- **Ready for Development**

**Example Output:**
```markdown
# Implementation Tasks: Shopping Cart

### Phase 1: Foundation
- [ ] 1. Set up cart state management foundation
  - Create CartContext.tsx with provider component  
  - **Acceptance Criteria**: Cart state persists across page refreshes
  - **Time Estimate**: 4 hours
  - _Requirements: Story 1.1, Story 2.1_
```

### Step 4: Track Progress
```bash
> /spec-status shopping-cart
```

Shows current phase, progress, and next recommended actions.

## 📚 Complete Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `/spec-init <name> <description>` | Initialize new specification | `/spec-init user-auth "Login system"` |
| `/spec-requirements <name>` | Enter requirements phase | `/spec-requirements user-auth` |
| `/spec-design <name>` | Generate design documentation | `/spec-design user-auth` |
| `/spec-tasks <name>` | Create implementation tasks | `/spec-tasks user-auth` |
| `/spec-status [name]` | Check specification status | `/spec-status user-auth` |

## 🏗️ Project Structure After Installation

```
your-project/
├── 📁 .specster/                    # Specster data directory
│   ├── 📁 specs/                    # Your specifications
│   │   └── 📁 shopping-cart/
│   │       ├── 📄 requirements.md   # EARS format requirements
│   │       ├── 📄 design.md         # Technical design docs
│   │       ├── 📄 tasks.md          # Implementation roadmap
│   │       └── 📄 .spec-state.json  # Workflow state
│   ├── 📁 state/                    # System state files
│   ├── 📁 templates/                # Document templates (customizable)
│   ├── 📁 config/                   # Workflow rules and settings
│   └── 📁 hooks/                    # Validation and progress hooks
├── 📁 .claude/
│   ├── 📁 commands/                 # Custom slash commands
│   │   ├── 📄 spec-init.md
│   │   ├── 📄 spec-requirements.md
│   │   ├── 📄 spec-design.md
│   │   ├── 📄 spec-tasks.md
│   │   └── 📄 spec-status.md
│   └── 📄 mcp_servers.json         # MCP server configuration
└── 📁 mcp-server/                   # Built MCP server
    └── 📁 dist/
        └── 📄 server.js
```

## 🔧 Manual Installation (Advanced)

If the automatic installer doesn't work, you can install manually:

### Step 1: Clone Specster Repository
```bash
git clone https://github.com/votiakov/specster.git
cd specster
```

### Step 2: Build MCP Server
```bash
cd mcp-server
npm install
npm run build
cd ..
```

### Step 3: Configure Claude Code
```bash
claude mcp add specster-server node "$(pwd)/mcp-server/dist/server.js" \
    -e SPECSTER_DATA_DIR=".specster" \
    -e SPECSTER_TEMPLATES_DIR=".specster/templates" \
    -e SPECSTER_CONFIG_DIR=".specster/config"
```

### Step 4: Verify Installation
```bash
node test-workflow.js
# Should show: "🎉 All tests passed! Specster is ready for use."
```

## 🎯 Complete Workflow Example

Here's a complete example from initialization to implementation-ready tasks:

### 1. Initialize Feature
```bash
> /spec-init user-authentication "Add secure login and registration system"
```

### 2. Requirements Phase
```bash
> /spec-requirements user-authentication
```

**Generated Requirements (excerpt):**
```markdown
### Story 1: User Registration
As a new user, I want to create an account, so that I can access personalized features.

**Acceptance Criteria:**
- WHEN user submits valid registration form THEN system SHALL create new account
- IF email already exists THEN system SHALL show "Email already registered" error
- WHEN password is weak THEN system SHALL show password strength requirements
- IF registration succeeds THEN system SHALL send verification email
```

### 3. Design Phase
```bash
> /spec-design user-authentication
```

**Generated Design (excerpt):**
```markdown
### Research Question 1: Authentication Strategy
**Research Findings**: JWT vs Sessions analysis shows JWT better for distributed systems
**Design Decision**: Implement JWT with refresh token rotation

### Component Architecture
- AuthProvider: Context for authentication state
- LoginForm: Handles user credentials
- RegistrationForm: User signup with validation
- AuthGuard: Route protection wrapper
```

### 4. Implementation Phase
```bash
> /spec-tasks user-authentication
```

**Generated Tasks (excerpt):**
```markdown
### Phase 1: Authentication Infrastructure
- [ ] 1. Set up authentication context and provider
  - Create AuthContext with login/logout/register methods
  - Implement JWT token storage and refresh logic
  - **Acceptance Criteria**: Users can authenticate and stay logged in
  - **Time Estimate**: 4 hours
  - _Requirements: Story 1.1, Story 2.1_

- [ ] 2. Create user registration form
  - Build form with email, password, confirm password fields
  - Add client-side validation for password strength
  - **Acceptance Criteria**: Form validates inputs before submission
  - **Time Estimate**: 3 hours
  - _Requirements: Story 1.2, Story 1.3_
```

### 5. Track Progress
```bash
> /spec-status user-authentication
```

**Output:**
```
📊 Specification Status: user-authentication

🔄 Current Phase: tasks (ready for implementation)
📅 Created: 2025-01-17 10:30 AM
👤 Author: Developer

📋 Progress Summary:
✅ Requirements: Completed (approved)
✅ Design: Completed (approved)  
🔄 Tasks: Ready to begin (12 tasks defined)

▶️  Next Actions:
   • Begin implementation using your preferred development tools
   • Use task breakdown in tasks.md as your roadmap
   • Check back with /spec-status to track progress
```

## ⚙️ Configuration & Customization

### Workflow Rules
Edit `.specster/config/workflow-rules.json` to customize:
- Phase transition requirements
- Approval workflow settings
- Validation criteria
- File naming conventions

### Templates
Customize document structure in `.specster/templates/`:
- **requirements-template.md** - Requirements document format
- **design-template.md** - Design document structure  
- **tasks-template.md** - Task breakdown format

### Environment Variables
Control Specster behavior:
```bash
export SPECSTER_DEBUG=true           # Enable debug logging
export SPECSTER_DEFAULT_AUTHOR="Your Name"  # Set default author
export SPECSTER_DATA_DIR="/custom/path"     # Custom data directory
```

## 🆘 Troubleshooting

### Installation Issues

**❌ "Node.js is not installed"**
```bash
# Install Node.js first
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**❌ "Claude Code CLI not found"**
```bash
# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code
```

**❌ "Build failed - server.js not found"**
```bash
# Check Node.js version (need v16+)
node --version

# Clean and rebuild
cd mcp-server
rm -rf node_modules dist
npm install
npm run build
```

### Runtime Issues

**❌ "Commands not working in Claude Code"**
- Verify MCP server is configured: `claude mcp list`
- Check Claude Code logs for errors
- Restart Claude Code: `claude restart`

**❌ "State not persisting between sessions"**
- Check `.specster/state/` directory exists and is writable
- Verify disk space availability
- Check file permissions: `ls -la .specster/`

**❌ "Templates not found"**
- Ensure you're in the project directory with `.specster/templates/`
- Verify template files exist: `ls .specster/templates/`
- Re-run installer: `./install.sh`

### Debug Mode
Enable verbose logging for troubleshooting:
```bash
# Run installer in verbose mode
./install.sh --verbose

# Enable debug logging
export SPECSTER_DEBUG=true
claude
```

### Getting Help

1. **Check the troubleshooting section above**
2. **Run installer with `--verbose` flag**
3. **Check Claude Code documentation**: [docs.anthropic.com/claude-code](https://docs.anthropic.com/en/docs/claude-code)
4. **Create an issue**: [GitHub Issues](https://github.com/votiakov/specster/issues)

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Add tests** for new functionality
5. **Run tests**: `npm test`
6. **Submit a pull request**

### Development Setup
```bash
git clone https://github.com/votiakov/specster.git
cd specster
./install.sh --verbose
```

### Running Tests
```bash
# Unit tests
cd mcp-server && npm test

# Integration tests  
node test-workflow.js

# Full test suite
./install.sh --verbose
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Claude Code team for the excellent MCP framework
- Contributors to the EARS requirements methodology
- The spec-driven development community

---

## 🌐 Installation Options

### Remote Installation (Recommended)
Perfect for first-time users or CI/CD:
```bash
curl -fsSL https://raw.githubusercontent.com/votiakov/specster/main/install.sh | bash
```

### Remote Installation with Options
```bash
# Verbose mode for troubleshooting
curl -fsSL https://raw.githubusercontent.com/votiakov/specster/main/install.sh | bash -s -- --verbose

# Silent mode for automation
curl -fsSL https://raw.githubusercontent.com/votiakov/specster/main/install.sh | bash -s -- --silent

# Preview what will be installed
curl -fsSL https://raw.githubusercontent.com/votiakov/specster/main/install.sh | bash -s -- --dry-run
```

### Local Installation
For development or when you want to examine the code first:
```bash
git clone https://github.com/votiakov/specster.git
cd specster
./install.sh
```

---

**Ready to transform your development workflow?** 

```bash
curl -fsSL https://raw.githubusercontent.com/votiakov/specster/main/install.sh | bash && claude
```

*Happy spec-driven development! 🚀*