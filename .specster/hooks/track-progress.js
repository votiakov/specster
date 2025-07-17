#!/usr/bin/env node

/**
 * Specster Notification Hook
 * Tracks progress and sends notifications
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
        trackProgress(hookInput);
    } catch (error) {
        console.error(`Hook tracking error: ${error.message}`);
        process.exit(1);
    }
});

function trackProgress(hookInput) {
    const { hook_event_name, message, session_id } = hookInput;
    
    try {
        switch (hook_event_name) {
            case 'Notification':
                handleNotification(message, session_id);
                break;
            default:
                // Other events, no tracking needed
                break;
        }
        
        console.log('Progress tracked successfully');
        process.exit(0);
        
    } catch (error) {
        console.error(`Progress tracking failed: ${error.message}`);
        process.exit(1);
    }
}

function handleNotification(message, sessionId) {
    // Track various notification types
    if (message.includes('Claude needs your permission')) {
        trackPermissionRequest(message, sessionId);
    } else if (message.includes('Claude is waiting for your input')) {
        trackInputWait(message, sessionId);
    } else if (message.includes('spec-') || message.includes('Specster')) {
        trackSpecsterActivity(message, sessionId);
    }
    
    // Always log general notifications
    logNotification(message, sessionId);
}

function trackPermissionRequest(message, sessionId) {
    const permissionLog = {
        timestamp: new Date().toISOString(),
        type: 'permission_request',
        message,
        sessionId,
        resolved: false
    };
    
    appendToLog('permissions.json', permissionLog);
    
    // Check if it's a Specster-related permission
    if (message.includes('mcp__specster-server__')) {
        const toolName = extractToolName(message);
        trackSpecsterPermission(toolName, sessionId);
    }
}

function trackInputWait(message, sessionId) {
    const waitLog = {
        timestamp: new Date().toISOString(),
        type: 'input_wait',
        message,
        sessionId,
        duration: 60 // Default wait time
    };
    
    appendToLog('input-waits.json', waitLog);
    
    // Update session statistics
    updateSessionStats(sessionId, 'input_waits');
}

function trackSpecsterActivity(message, sessionId) {
    const activityLog = {
        timestamp: new Date().toISOString(),
        type: 'specster_activity',
        message,
        sessionId,
        category: categorizeSpecsterActivity(message)
    };
    
    appendToLog('specster-activity.json', activityLog);
    
    // Update Specster statistics
    updateSpecsterStats(activityLog.category);
}

function trackSpecsterPermission(toolName, sessionId) {
    const permissionLog = {
        timestamp: new Date().toISOString(),
        toolName,
        sessionId,
        status: 'requested'
    };
    
    appendToLog('specster-permissions.json', permissionLog);
    
    // Track tool usage patterns
    updateToolUsageStats(toolName);
}

function logNotification(message, sessionId) {
    const notificationLog = {
        timestamp: new Date().toISOString(),
        message,
        sessionId,
        source: 'claude_code'
    };
    
    appendToLog('notifications.json', notificationLog);
}

function appendToLog(fileName, logEntry) {
    const logPath = path.join('.specster', 'state', fileName);
    
    let logs = [];
    if (fs.existsSync(logPath)) {
        try {
            const logData = fs.readFileSync(logPath, 'utf8');
            logs = JSON.parse(logData);
        } catch (error) {
            console.warn(`Failed to read log file ${fileName}: ${error.message}`);
        }
    }
    
    logs.push(logEntry);
    
    // Keep only last 1000 entries
    if (logs.length > 1000) {
        logs = logs.slice(-1000);
    }
    
    try {
        ensureDirectoryExists(path.dirname(logPath));
        fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
    } catch (error) {
        console.warn(`Failed to write log file ${fileName}: ${error.message}`);
    }
}

function updateSessionStats(sessionId, statType) {
    const statsPath = path.join('.specster', 'state', 'session-stats.json');
    
    let stats = {};
    if (fs.existsSync(statsPath)) {
        try {
            const statsData = fs.readFileSync(statsPath, 'utf8');
            stats = JSON.parse(statsData);
        } catch (error) {
            console.warn(`Failed to read session stats: ${error.message}`);
        }
    }
    
    if (!stats[sessionId]) {
        stats[sessionId] = {
            created: new Date().toISOString(),
            input_waits: 0,
            permission_requests: 0,
            specster_activities: 0
        };
    }
    
    stats[sessionId][statType] = (stats[sessionId][statType] || 0) + 1;
    stats[sessionId].lastActivity = new Date().toISOString();
    
    try {
        fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    } catch (error) {
        console.warn(`Failed to write session stats: ${error.message}`);
    }
}

function updateSpecsterStats(category) {
    const statsPath = path.join('.specster', 'state', 'specster-stats.json');
    
    let stats = {
        totalActivities: 0,
        categories: {},
        dailyStats: {}
    };
    
    if (fs.existsSync(statsPath)) {
        try {
            const statsData = fs.readFileSync(statsPath, 'utf8');
            stats = JSON.parse(statsData);
        } catch (error) {
            console.warn(`Failed to read Specster stats: ${error.message}`);
        }
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    stats.totalActivities = (stats.totalActivities || 0) + 1;
    stats.categories[category] = (stats.categories[category] || 0) + 1;
    stats.dailyStats[today] = (stats.dailyStats[today] || 0) + 1;
    stats.lastActivity = new Date().toISOString();
    
    try {
        fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    } catch (error) {
        console.warn(`Failed to write Specster stats: ${error.message}`);
    }
}

function updateToolUsageStats(toolName) {
    const statsPath = path.join('.specster', 'state', 'tool-usage-stats.json');
    
    let stats = {};
    if (fs.existsSync(statsPath)) {
        try {
            const statsData = fs.readFileSync(statsPath, 'utf8');
            stats = JSON.parse(statsData);
        } catch (error) {
            console.warn(`Failed to read tool usage stats: ${error.message}`);
        }
    }
    
    if (!stats[toolName]) {
        stats[toolName] = {
            usageCount: 0,
            firstUsed: new Date().toISOString(),
            lastUsed: new Date().toISOString()
        };
    }
    
    stats[toolName].usageCount += 1;
    stats[toolName].lastUsed = new Date().toISOString();
    
    try {
        fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    } catch (error) {
        console.warn(`Failed to write tool usage stats: ${error.message}`);
    }
}

function extractToolName(message) {
    const match = message.match(/mcp__specster-server__(\w+)/);
    return match ? match[1] : 'unknown';
}

function categorizeSpecsterActivity(message) {
    if (message.includes('init') || message.includes('initialize')) {
        return 'initialization';
    } else if (message.includes('requirements')) {
        return 'requirements';
    } else if (message.includes('design')) {
        return 'design';
    } else if (message.includes('tasks') || message.includes('implementation')) {
        return 'tasks';
    } else if (message.includes('status')) {
        return 'status';
    } else if (message.includes('save') || message.includes('load')) {
        return 'file_operations';
    } else {
        return 'other';
    }
}

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}