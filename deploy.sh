#!/bin/bash

# Specster Deployment Script
# This script builds and configures the Specster system for use with Claude Code

set -e

echo "🚀 Starting Specster deployment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Build the MCP server
echo "🔧 Building MCP server..."
cd mcp-server
npm install
npm run build
cd ..

# Verify build succeeded
if [ ! -f "mcp-server/dist/server.js" ]; then
    echo "❌ Build failed - server.js not found in dist directory"
    exit 1
fi

# Create .specster directory structure if it doesn't exist
echo "📁 Creating directory structure..."
mkdir -p .specster/{specs,state,templates,config,hooks}

# Set up hook permissions
echo "🔒 Setting up hook permissions..."
chmod +x .specster/hooks/*.js

# Check if Claude Code is installed
if ! command -v claude &> /dev/null; then
    echo "⚠️  Claude Code CLI is not installed. Please install it first:"
    echo "   npm install -g @anthropic-ai/claude-code"
    echo ""
    echo "📋 After installing Claude Code, run:"
    echo "   claude mcp add specster-server node $(pwd)/mcp-server/dist/server.js"
    echo ""
else
    echo "✅ Claude Code found. Configuring MCP server..."
    
    # Add MCP server to Claude Code
    claude mcp add specster-server node "$(pwd)/mcp-server/dist/server.js" \
        -e SPECSTER_DATA_DIR=".specster" \
        -e SPECSTER_TEMPLATES_DIR=".specster/templates" \
        -e SPECSTER_CONFIG_DIR=".specster/config" \
        -e SPECSTER_DEFAULT_AUTHOR="$(whoami)" \
        -e SPECSTER_ENABLE_VALIDATION="true" \
        -e NODE_ENV="production"
    
    echo "✅ MCP server configured successfully!"
fi

# Verify templates exist
echo "📋 Checking templates..."
if [ ! -f ".specster/templates/requirements-template.md" ]; then
    echo "❌ Requirements template not found"
    exit 1
fi

if [ ! -f ".specster/templates/design-template.md" ]; then
    echo "❌ Design template not found"
    exit 1
fi

if [ ! -f ".specster/templates/tasks-template.md" ]; then
    echo "❌ Tasks template not found"
    exit 1
fi

echo "✅ All templates verified"

# Check if slash commands are available
echo "🔍 Checking slash commands..."
if [ ! -f ".claude/commands/spec-init.md" ]; then
    echo "❌ Slash commands not found"
    exit 1
fi

echo "✅ Slash commands verified"

# Run tests
echo "🧪 Running tests..."
cd mcp-server
npm test
cd ..

echo ""
echo "🎉 Specster deployment completed successfully!"
echo ""
echo "📚 Usage:"
echo "   Start Claude Code and use these commands:"
echo "   > /spec-init <name> <description>     - Initialize new specification"
echo "   > /spec-requirements <name>           - Enter requirements phase"
echo "   > /spec-design <name>                 - Generate design documentation"
echo "   > /spec-tasks <name>                  - Create implementation tasks"
echo "   > /spec-status <name>                 - Check specification status"
echo ""
echo "🔧 Configuration:"
echo "   - MCP server: configured and ready"
echo "   - Slash commands: available"
echo "   - Hooks: configured for validation and tracking"
echo "   - Templates: ready for use"
echo ""
echo "📖 For more information, see README.md"
echo ""
echo "Happy spec-driven development! 🚀"