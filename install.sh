#!/bin/bash

# Specster Universal Installer
# Cross-platform installation script for Specster spec-driven development tool

set -e

# Configuration
SPECSTER_VERSION="1.0.0"
MIN_NODE_VERSION="16"
REPO_URL="https://github.com/votiakov/specster"
VERBOSE=false
SILENT=false
DRY_RUN=false
REMOTE_INSTALL=false
TEMP_DIR=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log() {
    if [ "$SILENT" = false ]; then
        echo -e "${GREEN}[INFO]${NC} $1"
    fi
}

warn() {
    if [ "$SILENT" = false ]; then
        echo -e "${YELLOW}[WARN]${NC} $1"
    fi
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    if [ "$SILENT" = false ]; then
        echo -e "${CYAN}[SUCCESS]${NC} $1"
    fi
}

debug() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${PURPLE}[DEBUG]${NC} $1"
    fi
}

# Installation context detection
detect_installation_context() {
    debug "Detecting installation context..."
    
    # Check if we're in a local Specster repository
    if [ -d "mcp-server" ] && [ -d ".specster" ] && [ -f "package.json" ]; then
        debug "Local repository detected"
        REMOTE_INSTALL=false
    elif [ -d "mcp-server" ] || [ -d ".specster" ]; then
        debug "Partial repository detected - may be incomplete"
        REMOTE_INSTALL=false
    else
        debug "No local repository detected - remote installation required"
        REMOTE_INSTALL=true
    fi
    
    if [ "$REMOTE_INSTALL" = true ]; then
        log "Remote installation mode: Will download repository from ${REPO_URL}"
    else
        log "Local installation mode: Using existing repository files"
    fi
}

# Check download tools availability
check_download_tools() {
    debug "Checking download tools availability..."
    
    local has_curl=false
    local has_wget=false
    local has_unzip=false
    
    if command -v curl &> /dev/null; then
        has_curl=true
        debug "curl is available"
    fi
    
    if command -v wget &> /dev/null; then
        has_wget=true
        debug "wget is available"
    fi
    
    if command -v unzip &> /dev/null; then
        has_unzip=true
        debug "unzip is available"
    fi
    
    if [ "$has_curl" = false ] && [ "$has_wget" = false ]; then
        error "Neither curl nor wget is available for downloading"
        echo "  Please install one of these tools:"
        echo "  - curl: apt install curl / brew install curl"
        echo "  - wget: apt install wget / brew install wget"
        exit 1
    fi
    
    if [ "$has_unzip" = false ]; then
        error "unzip is not available for extracting repository"
        echo "  Please install unzip:"
        echo "  - Ubuntu/Debian: apt install unzip"
        echo "  - macOS: brew install unzip"
        echo "  - CentOS/RHEL: yum install unzip"
        exit 1
    fi
    
    success "Download tools available ✓"
}

# Download repository from GitHub
download_repository() {
    if [ "$REMOTE_INSTALL" = false ]; then
        debug "Skipping repository download - using local files"
        return 0
    fi
    
    log "Downloading Specster repository..."
    
    if [ "$DRY_RUN" = true ]; then
        echo "Would download: ${REPO_URL}/archive/refs/heads/main.zip"
        echo "Would extract to temporary directory"
        return 0
    fi
    
    # Create temporary directory
    TEMP_DIR=$(mktemp -d -t specster-install.XXXXXX)
    debug "Created temporary directory: $TEMP_DIR"
    
    local zip_file="$TEMP_DIR/specster.zip"
    local download_url="${REPO_URL}/archive/refs/heads/main.zip"
    
    # Download repository ZIP
    debug "Downloading from: $download_url"
    if command -v curl &> /dev/null; then
        if [ "$VERBOSE" = true ]; then
            curl -fL "$download_url" -o "$zip_file"
        else
            curl -fsSL "$download_url" -o "$zip_file"
        fi
    else
        if [ "$VERBOSE" = true ]; then
            wget "$download_url" -O "$zip_file"
        else
            wget -q "$download_url" -O "$zip_file"
        fi
    fi
    
    # Verify download
    if [ ! -f "$zip_file" ] || [ ! -s "$zip_file" ]; then
        error "Failed to download repository"
        cleanup_temp_files
        exit 1
    fi
    
    debug "Download completed: $(du -h "$zip_file" | cut -f1)"
    
    # Extract repository
    debug "Extracting repository..."
    cd "$TEMP_DIR"
    if [ "$VERBOSE" = true ]; then
        unzip "$zip_file"
    else
        unzip -q "$zip_file"
    fi
    
    # Find extracted directory (should be specster-main)
    local extracted_dir=$(find . -maxdepth 1 -type d -name "specster-*" | head -1)
    if [ -z "$extracted_dir" ]; then
        error "Failed to find extracted repository directory"
        cleanup_temp_files
        exit 1
    fi
    
    debug "Repository extracted to: $extracted_dir"
    
    # Move to the extracted directory
    cd "$extracted_dir"
    
    # Verify repository structure
    if [ ! -d "mcp-server" ] || [ ! -d ".specster" ]; then
        error "Downloaded repository has invalid structure"
        cleanup_temp_files
        exit 1
    fi
    
    success "Repository downloaded and extracted ✓"
}

# Cleanup temporary files
cleanup_temp_files() {
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        debug "Cleaning up temporary directory: $TEMP_DIR"
        rm -rf "$TEMP_DIR"
        TEMP_DIR=""
    fi
}

# Enhanced cleanup for failed installations
cleanup_on_failure_enhanced() {
    error "Installation failed. Cleaning up..."
    
    if [ "$DRY_RUN" = true ]; then
        echo "Would clean up partial installation and temporary files"
        return 0
    fi
    
    # Clean up temporary files first
    cleanup_temp_files
    
    # Then run existing cleanup logic
    cleanup_on_failure
}

# Help function
show_help() {
    cat << EOF
Specster Universal Installer v${SPECSTER_VERSION}

USAGE:
    $0 [OPTIONS]

OPTIONS:
    -h, --help          Show this help message
    -v, --verbose       Enable verbose output
    -s, --silent        Silent installation (minimal output)
    -d, --dry-run       Show what would be done without executing
    --skip-claude       Skip Claude Code CLI installation check
    --skip-tests        Skip running tests after installation

EXAMPLES:
    $0                  # Standard installation
    $0 --verbose        # Installation with detailed output
    $0 --silent         # Quiet installation for scripts
    $0 --dry-run        # Preview installation steps

DESCRIPTION:
    This script installs Specster, a spec-driven development tool that integrates
    with Claude Code to provide structured requirements gathering, design
    documentation, and implementation task creation.

    The installer supports both local and remote installation:
    - Remote: Automatically downloads repository from GitHub
    - Local: Uses existing cloned repository files

    The installer will:
    1. Detect installation context (remote vs local)
    2. Download repository if needed (remote mode)
    3. Check system prerequisites (Node.js, npm)
    4. Build the MCP server
    5. Configure Claude Code integration
    6. Set up project templates and hooks
    7. Validate the installation

REQUIREMENTS:
    - Node.js v${MIN_NODE_VERSION}+ and npm
    - Claude Code CLI (optional, can be installed later)
    - curl or wget (for remote installation)
    - unzip (for remote installation)
    - Unix-like environment (Linux, macOS, WSL on Windows)

For more information, visit: ${REPO_URL}
EOF
}

# Platform detection
detect_platform() {
    local platform=""
    local arch=""
    
    # Detect OS
    case "$(uname -s)" in
        Linux*)     platform="linux" ;;
        Darwin*)    platform="macos" ;;
        CYGWIN*|MINGW*|MSYS*) platform="windows" ;;
        *)          platform="unknown" ;;
    esac
    
    # Detect architecture
    case "$(uname -m)" in
        x86_64|amd64)   arch="x64" ;;
        arm64|aarch64)  arch="arm64" ;;
        armv7l)         arch="armv7" ;;
        *)              arch="unknown" ;;
    esac
    
    debug "Detected platform: $platform ($arch)"
    echo "$platform"
}

# Version comparison function
version_compare() {
    local version1=$1
    local version2=$2
    
    if [ "$(printf '%s\n' "$version1" "$version2" | sort -V | head -n1)" = "$version2" ]; then
        return 0  # version1 >= version2
    else
        return 1  # version1 < version2
    fi
}

# Check prerequisites
check_prerequisites() {
    log "Checking system prerequisites..."
    
    local platform=$(detect_platform)
    local errors=0
    
    # Check Node.js
    if command -v node &> /dev/null; then
        local node_version=$(node --version | sed 's/v//')
        debug "Found Node.js version: $node_version"
        
        if version_compare "$node_version" "$MIN_NODE_VERSION.0.0"; then
            success "Node.js v$node_version is installed ✓"
        else
            error "Node.js v$MIN_NODE_VERSION+ is required (found v$node_version)"
            ((errors++))
        fi
    else
        error "Node.js is not installed"
        case "$platform" in
            "macos")
                echo "  Install with: brew install node"
                echo "  Or download from: https://nodejs.org/"
                ;;
            "linux")
                echo "  Install with: sudo apt install nodejs npm  # Ubuntu/Debian"
                echo "  Or: sudo yum install nodejs npm          # CentOS/RHEL"
                echo "  Or download from: https://nodejs.org/"
                ;;
            "windows")
                echo "  Download from: https://nodejs.org/"
                echo "  Or use Windows Package Manager: winget install OpenJS.NodeJS"
                ;;
        esac
        ((errors++))
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        local npm_version=$(npm --version)
        debug "Found npm version: $npm_version"
        success "npm v$npm_version is installed ✓"
    else
        error "npm is not installed (usually comes with Node.js)"
        ((errors++))
    fi
    
    # Check Claude Code CLI (optional)
    if [ "$SKIP_CLAUDE" != true ]; then
        if command -v claude &> /dev/null; then
            local claude_version=$(claude --version 2>/dev/null || echo "unknown")
            success "Claude Code CLI is installed ✓"
            debug "Claude Code version: $claude_version"
        else
            warn "Claude Code CLI is not installed"
            echo "  This is optional but required for full functionality"
            echo "  Install with: npm install -g @anthropic-ai/claude-code"
            echo "  Or skip with: $0 --skip-claude"
        fi
    fi
    
    # Check Git (helpful for development)
    if command -v git &> /dev/null; then
        debug "Git is available"
    else
        warn "Git is not installed (recommended for version control)"
    fi
    
    if [ $errors -gt 0 ]; then
        error "Please install the missing prerequisites and run the installer again."
        exit 1
    fi
    
    success "All prerequisites satisfied ✓"
}

# Create project structure
create_project_structure() {
    log "Creating project directory structure..."
    
    if [ "$DRY_RUN" = true ]; then
        echo "Would create directories: .specster/{specs,state,templates,config,hooks}"
        echo "Would create directories: .claude/commands"
        return 0
    fi
    
    # Create .specster directory structure
    mkdir -p .specster/{specs,state,templates,config,hooks}
    success "Created .specster directory structure"
    
    # Create .claude directory structure
    mkdir -p .claude/commands
    success "Created .claude directory structure"
    
    # Verify templates exist (they should already be there from the repo)
    local templates=("requirements-template.md" "design-template.md" "tasks-template.md")
    for template in "${templates[@]}"; do
        if [ ! -f ".specster/templates/$template" ]; then
            warn "Template $template not found - this may cause issues"
        else
            debug "Template $template found ✓"
        fi
    done
}

# Build MCP server
build_mcp_server() {
    log "Building MCP server..."
    
    if [ "$DRY_RUN" = true ]; then
        echo "Would run: cd mcp-server && npm install && npm run build"
        return 0
    fi
    
    if [ ! -d "mcp-server" ]; then
        error "mcp-server directory not found. Are you in the Specster project directory?"
        exit 1
    fi
    
    cd mcp-server
    
    # Install dependencies
    debug "Installing npm dependencies..."
    if [ "$VERBOSE" = true ]; then
        npm install
    else
        npm install --silent
    fi
    
    # Build the project
    debug "Building TypeScript project..."
    if [ "$VERBOSE" = true ]; then
        npm run build
    else
        npm run build --silent
    fi
    
    cd ..
    
    # Verify build succeeded
    if [ ! -f "mcp-server/dist/server.js" ]; then
        error "Build failed - server.js not found in mcp-server/dist/"
        exit 1
    fi
    
    success "MCP server built successfully ✓"
}

# Configure Claude Code
configure_claude_code() {
    if [ "$SKIP_CLAUDE" = true ]; then
        log "Skipping Claude Code configuration (--skip-claude specified)"
        return 0
    fi
    
    log "Configuring Claude Code MCP server..."
    
    if ! command -v claude &> /dev/null; then
        warn "Claude Code CLI not found - skipping MCP server configuration"
        echo "  To configure later, run:"
        echo "  claude mcp add specster-server node $(pwd)/mcp-server/dist/server.js \\"
        echo "    -e SPECSTER_DATA_DIR='.specster' \\"
        echo "    -e SPECSTER_TEMPLATES_DIR='.specster/templates' \\"
        echo "    -e SPECSTER_CONFIG_DIR='.specster/config'"
        return 0
    fi
    
    if [ "$DRY_RUN" = true ]; then
        echo "Would configure Claude Code MCP server with specster-server"
        return 0
    fi
    
    # Get absolute path to the server
    local server_path="$(pwd)/mcp-server/dist/server.js"
    local author_name="${USER:-$(whoami 2>/dev/null || echo 'Developer')}"
    
    debug "Configuring MCP server at: $server_path"
    debug "Default author: $author_name"
    
    # Add MCP server to Claude Code
    claude mcp add specster-server node "$server_path" \
        -e SPECSTER_DATA_DIR=".specster" \
        -e SPECSTER_TEMPLATES_DIR=".specster/templates" \
        -e SPECSTER_CONFIG_DIR=".specster/config" \
        -e SPECSTER_DEFAULT_AUTHOR="$author_name" \
        -e SPECSTER_ENABLE_VALIDATION="true" \
        -e NODE_ENV="production" 2>/dev/null || {
        
        warn "Failed to automatically configure Claude Code MCP server"
        echo "  Please run this command manually:"
        echo "  claude mcp add specster-server node '$server_path' \\"
        echo "    -e SPECSTER_DATA_DIR='.specster' \\"
        echo "    -e SPECSTER_TEMPLATES_DIR='.specster/templates' \\"
        echo "    -e SPECSTER_CONFIG_DIR='.specster/config'"
        return 0
    }
    
    success "Claude Code MCP server configured ✓"
}

# Set up permissions
setup_permissions() {
    log "Setting up file permissions..."
    
    if [ "$DRY_RUN" = true ]; then
        echo "Would make hook files executable"
        return 0
    fi
    
    # Make hook files executable
    if [ -d ".specster/hooks" ]; then
        chmod +x .specster/hooks/*.js 2>/dev/null || true
        debug "Hook files made executable"
    fi
    
    # Ensure templates are readable
    if [ -d ".specster/templates" ]; then
        chmod 644 .specster/templates/*.md 2>/dev/null || true
        debug "Template files permissions set"
    fi
    
    success "File permissions configured ✓"
}

# Run tests
run_tests() {
    if [ "$SKIP_TESTS" = true ]; then
        log "Skipping tests (--skip-tests specified)"
        return 0
    fi
    
    log "Running installation tests..."
    
    if [ "$DRY_RUN" = true ]; then
        echo "Would run: npm test in mcp-server directory"
        echo "Would run: node test-workflow.js"
        return 0
    fi
    
    # Run MCP server tests
    cd mcp-server
    debug "Running MCP server unit tests..."
    if [ "$VERBOSE" = true ]; then
        npm test
    else
        npm test --silent
    fi
    cd ..
    
    # Run workflow tests if available
    if [ -f "test-workflow.js" ]; then
        debug "Running workflow integration tests..."
        if [ "$VERBOSE" = true ]; then
            node test-workflow.js
        else
            node test-workflow.js > /dev/null 2>&1
        fi
    fi
    
    success "All tests passed ✓"
}

# Installation summary
show_summary() {
    if [ "$SILENT" = true ]; then
        return 0
    fi
    
    echo ""
    echo -e "${GREEN}🎉 Specster installation completed successfully!${NC}"
    echo ""
    echo -e "${BLUE}📚 Quick Start:${NC}"
    echo "  1. Start Claude Code CLI:"
    echo "     ${CYAN}claude${NC}"
    echo ""
    echo "  2. Initialize your first specification:"
    echo "     ${CYAN}> /spec-init my-feature \"Description of my feature\"${NC}"
    echo ""
    echo "  3. Work through the phases:"
    echo "     ${CYAN}> /spec-requirements my-feature${NC}  # Requirements gathering"
    echo "     ${CYAN}> /spec-design my-feature${NC}        # Design documentation"
    echo "     ${CYAN}> /spec-tasks my-feature${NC}         # Implementation tasks"
    echo "     ${CYAN}> /spec-status my-feature${NC}        # Check progress"
    echo ""
    echo -e "${BLUE}📁 Project Structure:${NC}"
    echo "  ${CYAN}.specster/${NC}              # Specster data directory"
    echo "  ${CYAN}.claude/commands/${NC}       # Custom slash commands"
    echo "  ${CYAN}mcp-server/dist/${NC}        # Built MCP server"
    echo ""
    echo -e "${BLUE}🔧 Configuration:${NC}"
    echo "  • MCP server: ${GREEN}configured and ready${NC}"
    echo "  • Slash commands: ${GREEN}available in Claude Code${NC}"
    echo "  • Templates: ${GREEN}ready for use${NC}"
    echo "  • Hooks: ${GREEN}configured for validation${NC}"
    echo ""
    echo -e "${BLUE}📖 Documentation:${NC}"
    echo "  • README.md - Complete usage guide"
    echo "  • DEMO.md - Workflow examples"
    echo "  • workflow.md - Methodology overview"
    echo ""
    echo -e "${BLUE}🆘 Need Help?${NC}"
    echo "  • Check README.md for troubleshooting"
    echo "  • Run with ${CYAN}--verbose${NC} for detailed output"
    echo "  • Visit project repository for issues and updates"
    echo ""
    echo -e "${GREEN}Happy spec-driven development! 🚀${NC}"
}

# Cleanup function for failed installations
cleanup_on_failure() {
    error "Installation failed. Cleaning up..."
    
    if [ "$DRY_RUN" = true ]; then
        echo "Would clean up partial installation"
        return 0
    fi
    
    # Remove partial MCP server build
    if [ -d "mcp-server/node_modules" ]; then
        rm -rf mcp-server/node_modules
        debug "Removed mcp-server/node_modules"
    fi
    
    if [ -d "mcp-server/dist" ]; then
        rm -rf mcp-server/dist
        debug "Removed mcp-server/dist"
    fi
    
    # Remove Claude Code MCP server configuration
    if command -v claude &> /dev/null; then
        claude mcp remove specster-server 2>/dev/null || true
        debug "Removed Claude Code MCP server configuration"
    fi
    
    warn "Partial installation cleaned up. Please fix the issues and try again."
}

# Main installation function
main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -s|--silent)
                SILENT=true
                shift
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            --skip-claude)
                SKIP_CLAUDE=true
                shift
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            *)
                error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
    
    # Set up error handling
    trap cleanup_on_failure_enhanced ERR
    
    # Welcome message
    if [ "$DRY_RUN" = true ]; then
        log "Specster Installation Preview (dry run mode)"
    else
        log "Starting Specster installation v${SPECSTER_VERSION}..."
    fi
    
    # Installation steps
    detect_installation_context
    if [ "$REMOTE_INSTALL" = true ]; then
        check_download_tools
        download_repository
    fi
    check_prerequisites
    create_project_structure
    build_mcp_server
    configure_claude_code
    setup_permissions
    run_tests
    
    # Clean up temporary files on success
    cleanup_temp_files
    
    # Success!
    show_summary
    
    exit 0
}

# Run main function
main "$@"