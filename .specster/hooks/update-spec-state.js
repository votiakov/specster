#!/usr/bin/env node

/**
 * Specster PostToolUse Hook
 * Updates state after successful MCP tool operations
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Read input from stdin
let input = '';
process.stdin.on('data', chunk => {
    input += chunk;
});

process.stdin.on('end', () => {
    try {
        const hookInput = JSON.parse(input);
        updateSpecState(hookInput);
    } catch (error) {
        console.error(`Hook update error: ${error.message}`);
        process.exit(1);
    }
});

function updateSpecState(hookInput) {
    const { tool_name, tool_input, tool_response } = hookInput;
    
    // Only process specster-server MCP tools
    if (!tool_name.startsWith('mcp__specster-server__')) {
        process.exit(0);
    }
    
    const toolName = tool_name.split('__')[2];
    
    try {
        switch (toolName) {
            case 'initializeSpec':
                updateAfterInitializeSpec(tool_input, tool_response);
                break;
            case 'enterRequirementsPhase':
                updateAfterEnterRequirementsPhase(tool_input, tool_response);
                break;
            case 'generateDesign':
                updateAfterGenerateDesign(tool_input, tool_response);
                break;
            case 'createImplementationTasks':
                updateAfterCreateImplementationTasks(tool_input, tool_response);
                break;
            case 'saveSpecificationFile':
                updateAfterSaveSpecificationFile(tool_input, tool_response);
                break;
            case 'updatePhaseProgress':
                updateAfterUpdatePhaseProgress(tool_input, tool_response);
                break;
            default:
                // Unknown tool, no state update needed
                break;
        }
        
        console.log('State updated successfully');
        process.exit(0);
        
    } catch (error) {
        console.error(`State update failed: ${error.message}`);
        process.exit(1);
    }
}

function updateAfterInitializeSpec(toolInput, toolResponse) {
    const { name, description } = toolInput;
    
    // Record workflow event
    recordWorkflowEvent(name, 'init', 'initialize', {
        description,
        toolResponse
    });
    
    // Create initial activity log
    const activityLog = {
        specName: name,
        events: [
            {
                timestamp: new Date().toISOString(),
                event: 'specification_initialized',
                details: {
                    name,
                    description,
                    phase: 'init'
                }
            }
        ]
    };
    
    const activityPath = path.join('.specster', 'state', `activity-${name}.json`);
    fs.writeFileSync(activityPath, JSON.stringify(activityLog, null, 2));
    
    console.log(`Specification '${name}' initialized successfully`);
}

function updateAfterEnterRequirementsPhase(toolInput, toolResponse) {
    const { specName } = toolInput;
    
    // Record workflow event
    recordWorkflowEvent(specName, 'requirements', 'enter_phase', {
        toolResponse
    });
    
    // Update last activity
    updateLastActivity(specName, 'entered_requirements_phase');
    
    console.log(`Entered requirements phase for '${specName}'`);
}

function updateAfterGenerateDesign(toolInput, toolResponse) {
    const { specName } = toolInput;
    
    // Record workflow event
    recordWorkflowEvent(specName, 'design', 'generate_design', {
        toolResponse
    });
    
    // Update last activity
    updateLastActivity(specName, 'generated_design');
    
    console.log(`Generated design for '${specName}'`);
}

function updateAfterCreateImplementationTasks(toolInput, toolResponse) {
    const { specName } = toolInput;
    
    // Record workflow event
    recordWorkflowEvent(specName, 'tasks', 'create_tasks', {
        toolResponse
    });
    
    // Update last activity
    updateLastActivity(specName, 'created_implementation_tasks');
    
    console.log(`Created implementation tasks for '${specName}'`);
}

function updateAfterSaveSpecificationFile(toolInput, toolResponse) {
    const { specName, fileName, content } = toolInput;
    
    // Record workflow event
    recordWorkflowEvent(specName, 'current', 'save_file', {
        fileName,
        contentLength: content.length,
        toolResponse
    });
    
    // Update file metadata
    updateFileMetadata(specName, fileName, content);
    
    // Update last activity
    updateLastActivity(specName, 'saved_file', { fileName });
    
    console.log(`Saved file '${fileName}' for '${specName}'`);
}

function updateAfterUpdatePhaseProgress(toolInput, toolResponse) {
    const { specName, phase, completed } = toolInput;
    
    // Record workflow event
    recordWorkflowEvent(specName, phase, 'update_progress', {
        completed,
        toolResponse
    });
    
    // Update last activity
    updateLastActivity(specName, 'updated_phase_progress', { phase, completed });
    
    console.log(`Updated phase progress for '${specName}': ${phase} = ${completed}`);
}

function recordWorkflowEvent(specName, phase, action, details) {
    const historyPath = path.join('.specster', 'state', `history-${specName}.json`);
    
    let history = [];
    if (fs.existsSync(historyPath)) {
        try {
            const historyData = fs.readFileSync(historyPath, 'utf8');
            history = JSON.parse(historyData);
        } catch (error) {
            console.warn(`Failed to read history file: ${error.message}`);
        }
    }
    
    const event = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        specName,
        phase,
        action,
        details,
        sessionId: process.env.CLAUDE_SESSION_ID || 'unknown'
    };
    
    history.push(event);
    
    // Keep only last 100 events
    if (history.length > 100) {
        history = history.slice(-100);
    }
    
    try {
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
    } catch (error) {
        console.warn(`Failed to write history file: ${error.message}`);
    }
}

function updateFileMetadata(specName, fileName, content) {
    const filePath = path.join('.specster', 'specs', specName, fileName);
    
    if (!fs.existsSync(filePath)) {
        return;
    }
    
    const stats = fs.statSync(filePath);
    const metadata = {
        fileName,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
        contentLength: content.length,
        checksumMD5: generateMD5(content),
        lastUpdatedBy: process.env.USER || 'unknown'
    };
    
    const metadataPath = path.join('.specster', 'state', `metadata-${specName}.json`);
    let allMetadata = {};
    
    if (fs.existsSync(metadataPath)) {
        try {
            const metadataData = fs.readFileSync(metadataPath, 'utf8');
            allMetadata = JSON.parse(metadataData);
        } catch (error) {
            console.warn(`Failed to read metadata file: ${error.message}`);
        }
    }
    
    allMetadata[fileName] = metadata;
    
    try {
        fs.writeFileSync(metadataPath, JSON.stringify(allMetadata, null, 2));
    } catch (error) {
        console.warn(`Failed to write metadata file: ${error.message}`);
    }
}

function updateLastActivity(specName, activity, details = {}) {
    const activityPath = path.join('.specster', 'state', `activity-${specName}.json`);
    
    let activityLog = {
        specName,
        events: []
    };
    
    if (fs.existsSync(activityPath)) {
        try {
            const activityData = fs.readFileSync(activityPath, 'utf8');
            activityLog = JSON.parse(activityData);
        } catch (error) {
            console.warn(`Failed to read activity file: ${error.message}`);
        }
    }
    
    const event = {
        timestamp: new Date().toISOString(),
        event: activity,
        details
    };
    
    activityLog.events.push(event);
    
    // Keep only last 50 events
    if (activityLog.events.length > 50) {
        activityLog.events = activityLog.events.slice(-50);
    }
    
    try {
        fs.writeFileSync(activityPath, JSON.stringify(activityLog, null, 2));
    } catch (error) {
        console.warn(`Failed to write activity file: ${error.message}`);
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function generateMD5(content) {
    return crypto.createHash('md5').update(content).digest('hex');
}