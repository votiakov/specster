#!/usr/bin/env node

/**
 * Specster PreToolUse Hook
 * Validates MCP tool calls before execution
 */

const fs = require('fs');
const path = require('path');

// Read input from stdin
let input = '';
process.stdin.on('data', chunk => {
    input += chunk;
});

process.stdin.on('end', () => {
    try {
        const hookInput = JSON.parse(input);
        validateSpecOperation(hookInput);
    } catch (error) {
        console.error(`Hook validation error: ${error.message}`);
        process.exit(1);
    }
});

function validateSpecOperation(hookInput) {
    const { tool_name, tool_input } = hookInput;
    
    // Only validate specster-server MCP tools
    if (!tool_name.startsWith('mcp__specster-server__')) {
        process.exit(0);
    }
    
    const toolName = tool_name.split('__')[2];
    
    try {
        switch (toolName) {
            case 'initializeSpec':
                validateInitializeSpec(tool_input);
                break;
            case 'enterRequirementsPhase':
                validateEnterRequirementsPhase(tool_input);
                break;
            case 'generateDesign':
                validateGenerateDesign(tool_input);
                break;
            case 'createImplementationTasks':
                validateCreateImplementationTasks(tool_input);
                break;
            case 'saveSpecificationFile':
                validateSaveSpecificationFile(tool_input);
                break;
            case 'loadSpecificationFile':
                validateLoadSpecificationFile(tool_input);
                break;
            default:
                // Unknown tool, allow it to proceed
                process.exit(0);
        }
        
        // If we get here, validation passed
        console.log('Validation passed');
        process.exit(0);
        
    } catch (error) {
        console.error(`Validation failed: ${error.message}`);
        process.exit(2); // Exit code 2 blocks the tool call
    }
}

function validateInitializeSpec(toolInput) {
    const { name, description } = toolInput;
    
    if (!name || typeof name !== 'string') {
        throw new Error('Specification name is required and must be a string');
    }
    
    if (!description || typeof description !== 'string') {
        throw new Error('Specification description is required and must be a string');
    }
    
    // Validate spec name format
    if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
        throw new Error('Specification name must contain only alphanumeric characters, hyphens, and underscores');
    }
    
    if (name.length > 50) {
        throw new Error('Specification name must be 50 characters or less');
    }
    
    if (description.length > 200) {
        throw new Error('Specification description must be 200 characters or less');
    }
    
    // Check if spec already exists
    const specPath = path.join('.specster', 'specs', name);
    if (fs.existsSync(specPath)) {
        throw new Error(`Specification '${name}' already exists`);
    }
    
    // Check for path traversal
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
        throw new Error('Specification name contains invalid characters');
    }
}

function validateEnterRequirementsPhase(toolInput) {
    const { specName } = toolInput;
    
    if (!specName || typeof specName !== 'string') {
        throw new Error('Specification name is required and must be a string');
    }
    
    validateSpecExists(specName);
    validateSpecPhase(specName, 'init');
}

function validateGenerateDesign(toolInput) {
    const { specName } = toolInput;
    
    if (!specName || typeof specName !== 'string') {
        throw new Error('Specification name is required and must be a string');
    }
    
    validateSpecExists(specName);
    validateSpecPhase(specName, 'requirements');
    validateRequirementsComplete(specName);
}

function validateCreateImplementationTasks(toolInput) {
    const { specName } = toolInput;
    
    if (!specName || typeof specName !== 'string') {
        throw new Error('Specification name is required and must be a string');
    }
    
    validateSpecExists(specName);
    validateSpecPhase(specName, 'design');
    validateDesignComplete(specName);
}

function validateSaveSpecificationFile(toolInput) {
    const { specName, fileName, content } = toolInput;
    
    if (!specName || typeof specName !== 'string') {
        throw new Error('Specification name is required and must be a string');
    }
    
    if (!fileName || typeof fileName !== 'string') {
        throw new Error('File name is required and must be a string');
    }
    
    if (!content || typeof content !== 'string') {
        throw new Error('File content is required and must be a string');
    }
    
    validateSpecExists(specName);
    
    // Validate file name
    const allowedFiles = ['requirements.md', 'design.md', 'tasks.md'];
    if (!allowedFiles.includes(fileName)) {
        throw new Error(`Invalid file name. Allowed files: ${allowedFiles.join(', ')}`);
    }
    
    // Validate content length
    if (content.length > 1048576) { // 1MB limit
        throw new Error('File content exceeds maximum size limit (1MB)');
    }
    
    // Basic content validation
    if (fileName === 'requirements.md' && !content.includes('WHEN') && !content.includes('SHALL')) {
        throw new Error('Requirements file should contain EARS format (WHEN/IF/THEN/SHALL)');
    }
    
    if (fileName === 'design.md' && !content.includes('Architecture')) {
        throw new Error('Design file should contain architecture section');
    }
    
    if (fileName === 'tasks.md' && !content.includes('- [ ]')) {
        throw new Error('Tasks file should contain task checklist items');
    }
}

function validateLoadSpecificationFile(toolInput) {
    const { specName, fileName } = toolInput;
    
    if (!specName || typeof specName !== 'string') {
        throw new Error('Specification name is required and must be a string');
    }
    
    if (!fileName || typeof fileName !== 'string') {
        throw new Error('File name is required and must be a string');
    }
    
    validateSpecExists(specName);
    
    // Validate file name
    const allowedFiles = ['requirements.md', 'design.md', 'tasks.md'];
    if (!allowedFiles.includes(fileName)) {
        throw new Error(`Invalid file name. Allowed files: ${allowedFiles.join(', ')}`);
    }
    
    // Check if file exists
    const filePath = path.join('.specster', 'specs', specName, fileName);
    if (!fs.existsSync(filePath)) {
        throw new Error(`File '${fileName}' does not exist for specification '${specName}'`);
    }
}

function validateSpecExists(specName) {
    const specPath = path.join('.specster', 'specs', specName);
    if (!fs.existsSync(specPath)) {
        throw new Error(`Specification '${specName}' does not exist`);
    }
    
    const stateFile = path.join('.specster', 'state', `spec-${specName}.json`);
    if (!fs.existsSync(stateFile)) {
        throw new Error(`Specification '${specName}' state file is missing`);
    }
}

function validateSpecPhase(specName, expectedPhase) {
    const stateFile = path.join('.specster', 'state', `spec-${specName}.json`);
    
    try {
        const stateData = fs.readFileSync(stateFile, 'utf8');
        const state = JSON.parse(stateData);
        
        if (state.workflow.currentPhase !== expectedPhase) {
            throw new Error(`Specification '${specName}' is in phase '${state.workflow.currentPhase}', expected '${expectedPhase}'`);
        }
    } catch (error) {
        if (error.message.includes('expected')) {
            throw error;
        }
        throw new Error(`Failed to read specification state: ${error.message}`);
    }
}

function validateRequirementsComplete(specName) {
    const requirementsFile = path.join('.specster', 'specs', specName, 'requirements.md');
    
    if (!fs.existsSync(requirementsFile)) {
        throw new Error(`Requirements file missing for specification '${specName}'`);
    }
    
    const content = fs.readFileSync(requirementsFile, 'utf8');
    
    // Check for essential sections
    const requiredSections = ['User Stories', 'Acceptance Criteria', 'Technical Requirements'];
    for (const section of requiredSections) {
        if (!content.includes(section)) {
            throw new Error(`Requirements file missing required section: ${section}`);
        }
    }
    
    // Check for EARS format
    if (!content.includes('WHEN') || !content.includes('SHALL')) {
        throw new Error('Requirements file should contain EARS format (WHEN/IF/THEN/SHALL)');
    }
}

function validateDesignComplete(specName) {
    const designFile = path.join('.specster', 'specs', specName, 'design.md');
    
    if (!fs.existsSync(designFile)) {
        throw new Error(`Design file missing for specification '${specName}'`);
    }
    
    const content = fs.readFileSync(designFile, 'utf8');
    
    // Check for essential sections
    const requiredSections = ['Architecture', 'Components', 'Data Models'];
    for (const section of requiredSections) {
        if (!content.includes(section)) {
            throw new Error(`Design file missing required section: ${section}`);
        }
    }
    
    // Check for diagrams
    if (!content.includes('```mermaid')) {
        throw new Error('Design file should contain architecture diagrams');
    }
}