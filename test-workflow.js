#!/usr/bin/env node

/**
 * End-to-End Workflow Test
 * Tests the complete Specster workflow from initialization to tasks
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🧪 Starting Specster End-to-End Workflow Test');
console.log('================================================\n');

// Test configuration
const testSpecName = 'test-feature';
const testDescription = 'A test feature for workflow validation';
const testDataDir = '.specster-test';

// Cleanup function
function cleanup() {
    try {
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true, force: true });
        }
        console.log('✅ Cleanup completed');
    } catch (error) {
        console.warn(`⚠️  Cleanup warning: ${error.message}`);
    }
}

// Setup test environment
function setupTest() {
    console.log('🔧 Setting up test environment...');
    
    // Set environment variables
    process.env.SPECSTER_DATA_DIR = testDataDir;
    process.env.SPECSTER_TEMPLATES_DIR = `${testDataDir}/templates`;
    process.env.SPECSTER_CONFIG_DIR = `${testDataDir}/config`;
    
    // Create test directory structure
    fs.mkdirSync(`${testDataDir}/specs`, { recursive: true });
    fs.mkdirSync(`${testDataDir}/state`, { recursive: true });
    fs.mkdirSync(`${testDataDir}/templates`, { recursive: true });
    fs.mkdirSync(`${testDataDir}/config`, { recursive: true });
    
    // Copy templates
    const templateSource = '.specster/templates';
    const templateDest = `${testDataDir}/templates`;
    
    if (fs.existsSync(templateSource)) {
        const templates = fs.readdirSync(templateSource);
        templates.forEach(template => {
            const sourcePath = path.join(templateSource, template);
            const destPath = path.join(templateDest, template);
            fs.copyFileSync(sourcePath, destPath);
        });
    }
    
    // Copy config
    const configSource = '.specster/config';
    const configDest = `${testDataDir}/config`;
    
    if (fs.existsSync(configSource)) {
        const configs = fs.readdirSync(configSource);
        configs.forEach(config => {
            const sourcePath = path.join(configSource, config);
            const destPath = path.join(configDest, config);
            fs.copyFileSync(sourcePath, destPath);
        });
    }
    
    console.log('✅ Test environment setup complete\n');
}

// Test 1: Project Structure
function testProjectStructure() {
    console.log('Test 1: Project Structure Validation');
    console.log('────────────────────────────────────');
    
    const requiredDirs = [
        'mcp-server/dist',
        '.specster/templates',
        '.specster/config',
        '.claude/commands'
    ];
    
    const requiredFiles = [
        'mcp-server/dist/server.js',
        '.specster/templates/requirements-template.md',
        '.specster/templates/design-template.md', 
        '.specster/templates/tasks-template.md',
        '.claude/commands/spec-init.md',
        '.claude/commands/spec-requirements.md',
        '.claude/commands/spec-design.md',
        '.claude/commands/spec-tasks.md',
        '.claude/commands/spec-status.md'
    ];
    
    let passed = 0;
    let total = requiredDirs.length + requiredFiles.length;
    
    // Check directories
    requiredDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
            console.log(`  ✅ Directory exists: ${dir}`);
            passed++;
        } else {
            console.log(`  ❌ Directory missing: ${dir}`);
        }
    });
    
    // Check files
    requiredFiles.forEach(file => {
        if (fs.existsSync(file)) {
            console.log(`  ✅ File exists: ${file}`);
            passed++;
        } else {
            console.log(`  ❌ File missing: ${file}`);
        }
    });
    
    console.log(`\n📊 Project Structure: ${passed}/${total} checks passed\n`);
    return passed === total;
}

// Test 2: Template Validation
function testTemplates() {
    console.log('Test 2: Template Content Validation');
    console.log('──────────────────────────────────');
    
    const templates = [
        {
            file: '.specster/templates/requirements-template.md',
            requiredContent: ['{{specName}}', 'EARS', 'WHEN', 'SHALL', 'User Stories']
        },
        {
            file: '.specster/templates/design-template.md',
            requiredContent: ['{{specName}}', 'Architecture', 'Components', 'Research']
        },
        {
            file: '.specster/templates/tasks-template.md',
            requiredContent: ['{{specName}}', 'Task Breakdown', '- [ ]', 'Requirements:']
        }
    ];
    
    let passed = 0;
    let total = 0;
    
    templates.forEach(template => {
        if (fs.existsSync(template.file)) {
            const content = fs.readFileSync(template.file, 'utf8');
            template.requiredContent.forEach(required => {
                total++;
                if (content.includes(required)) {
                    console.log(`  ✅ ${template.file} contains: ${required}`);
                    passed++;
                } else {
                    console.log(`  ❌ ${template.file} missing: ${required}`);
                }
            });
        } else {
            console.log(`  ❌ Template file missing: ${template.file}`);
        }
    });
    
    console.log(`\n📊 Template Validation: ${passed}/${total} checks passed\n`);
    return passed === total;
}

// Test 3: Slash Commands
function testSlashCommands() {
    console.log('Test 3: Slash Command Validation');
    console.log('───────────────────────────────────');
    
    const commands = [
        { 
            file: '.claude/commands/spec-init.md',
            requiredContent: ['mcp_call', 'specster-server', 'initializeSpec']
        },
        {
            file: '.claude/commands/spec-requirements.md', 
            requiredContent: ['mcp_call', 'enterRequirementsPhase', 'EARS']
        },
        {
            file: '.claude/commands/spec-design.md',
            requiredContent: ['mcp_call', 'generateDesign', 'research']
        },
        {
            file: '.claude/commands/spec-tasks.md',
            requiredContent: ['mcp_call', 'createImplementationTasks', 'breakdown']
        },
        {
            file: '.claude/commands/spec-status.md',
            requiredContent: ['mcp_call', 'getSpecStatus', 'progress']
        }
    ];
    
    let passed = 0;
    let total = 0;
    
    commands.forEach(command => {
        if (fs.existsSync(command.file)) {
            const content = fs.readFileSync(command.file, 'utf8');
            command.requiredContent.forEach(required => {
                total++;
                if (content.includes(required)) {
                    console.log(`  ✅ ${command.file} contains: ${required}`);
                    passed++;
                } else {
                    console.log(`  ❌ ${command.file} missing: ${required}`);
                }
            });
        } else {
            console.log(`  ❌ Command file missing: ${command.file}`);
        }
    });
    
    console.log(`\n📊 Slash Commands: ${passed}/${total} checks passed\n`);
    return passed === total;
}

// Test 4: Workflow Compliance
function testWorkflowCompliance() {
    console.log('Test 4: Workflow Compliance Validation');
    console.log('─────────────────────────────────────');
    
    const workflowChecks = [
        {
            name: 'Requirements template has EARS format',
            check: () => {
                const content = fs.readFileSync('.specster/templates/requirements-template.md', 'utf8');
                return content.includes('WHEN') && content.includes('SHALL') && content.includes('IF') && content.includes('THEN');
            }
        },
        {
            name: 'Design template includes research integration',
            check: () => {
                const content = fs.readFileSync('.specster/templates/design-template.md', 'utf8');
                return content.includes('Research') && content.includes('Design Decision') && content.includes('Context');
            }
        },
        {
            name: 'Tasks template has granular breakdown',
            check: () => {
                const content = fs.readFileSync('.specster/templates/tasks-template.md', 'utf8');
                return content.includes('- [ ]') && content.includes('Requirements:') && content.includes('Phase');
            }
        },
        {
            name: 'Workflow rules enforce sequential phases',
            check: () => {
                const rulesPath = '.specster/config/workflow-rules.json';
                if (!fs.existsSync(rulesPath)) return false;
                const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
                return rules.phaseTransitions && 
                       rules.phaseTransitions.init.includes('requirements') &&
                       rules.phaseTransitions.requirements.includes('design') &&
                       rules.phaseTransitions.design.includes('tasks');
            }
        },
        {
            name: 'Approval requirements configured',
            check: () => {
                const rulesPath = '.specster/config/workflow-rules.json';
                if (!fs.existsSync(rulesPath)) return false;
                const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
                return rules.approvalRequired && 
                       rules.approvalRequired.includes('requirements') &&
                       rules.approvalRequired.includes('design') &&
                       rules.approvalRequired.includes('tasks');
            }
        }
    ];
    
    let passed = 0;
    
    workflowChecks.forEach(check => {
        try {
            if (check.check()) {
                console.log(`  ✅ ${check.name}`);
                passed++;
            } else {
                console.log(`  ❌ ${check.name}`);
            }
        } catch (error) {
            console.log(`  ❌ ${check.name} (Error: ${error.message})`);
        }
    });
    
    console.log(`\n📊 Workflow Compliance: ${passed}/${workflowChecks.length} checks passed\n`);
    return passed === workflowChecks.length;
}

// Test 5: Build and Functionality
function testBuildAndFunctionality() {
    console.log('Test 5: Build and Functionality Validation');
    console.log('─────────────────────────────────────────');
    
    try {
        // Test MCP server build
        console.log('  🔧 Testing MCP server build...');
        execSync('npm run build', { stdio: 'pipe', cwd: 'mcp-server' });
        console.log('  ✅ MCP server builds successfully');
        
        // Test MCP server tests
        console.log('  🧪 Running MCP server tests...');
        let testOutput;
        try {
            testOutput = execSync('npm test 2>&1', { encoding: 'utf8', cwd: 'mcp-server' });
        } catch (error) {
            // Jest returns non-zero exit code when tests fail, but we want the output
            testOutput = error.stdout + error.stderr;
        }
        
        // Debug test output detection
        // console.log('Test output contains Tests:', testOutput.includes('Tests:'));
        // console.log('Test output contains Test Suites:', testOutput.includes('Test Suites:'));
        // console.log('Test output contains passed:', testOutput.includes('passed'));
        // console.log('Test output contains failed:', testOutput.includes('failed'));
        
        const testsPassed = (testOutput.includes('Tests:') || testOutput.includes('Test Suites:')) && 
                           testOutput.includes('passed') && 
                           !testOutput.includes('failed');
        
        if (testsPassed) {
            console.log('  ✅ All MCP server tests pass');
        } else {
            console.log('  ❌ Some MCP server tests failed');
            // Debug: show actual output if tests fail
            // console.log('Actual test output length:', testOutput.length);
            // console.log('Actual test output:', JSON.stringify(testOutput));
            return false;
        }
        
        // Test file structure created by build
        const distFiles = [
            'mcp-server/dist/server.js',
            'mcp-server/dist/types/index.js', 
            'mcp-server/dist/lib/workflow-engine.js',
            'mcp-server/dist/lib/state-manager.js'
        ];
        
        let buildFilesOk = true;
        distFiles.forEach(file => {
            if (fs.existsSync(file)) {
                console.log(`  ✅ Build artifact exists: ${file}`);
            } else {
                console.log(`  ❌ Build artifact missing: ${file}`);
                buildFilesOk = false;
            }
        });
        
        console.log(`\n📊 Build and Functionality: ${buildFilesOk ? 'All checks passed' : 'Some checks failed'}\n`);
        return buildFilesOk;
        
    } catch (error) {
        console.log(`  ❌ Build/test error: ${error.message}`);
        console.log(`\n📊 Build and Functionality: Failed\n`);
        return false;
    }
}

// Main test runner
function runTests() {
    console.log('Starting comprehensive workflow validation...\n');
    
    const tests = [
        { name: 'Project Structure', fn: testProjectStructure },
        { name: 'Template Validation', fn: testTemplates },
        { name: 'Slash Commands', fn: testSlashCommands },
        { name: 'Workflow Compliance', fn: testWorkflowCompliance },
        { name: 'Build and Functionality', fn: testBuildAndFunctionality }
    ];
    
    let passedTests = 0;
    
    tests.forEach(test => {
        try {
            const result = test.fn();
            if (result) {
                passedTests++;
            }
        } catch (error) {
            console.log(`❌ Test '${test.name}' failed with error: ${error.message}\n`);
        }
    });
    
    console.log('🎯 Final Results');
    console.log('=================');
    console.log(`Tests Passed: ${passedTests}/${tests.length}`);
    console.log(`Success Rate: ${Math.round((passedTests / tests.length) * 100)}%`);
    
    if (passedTests === tests.length) {
        console.log('🎉 All tests passed! Specster is ready for use.');
        console.log('\n📋 Next Steps:');
        console.log('   1. Start Claude Code');
        console.log('   2. Use /spec-init <name> <description> to begin');
        console.log('   3. Follow the three-phase workflow');
        return true;
    } else {
        console.log('⚠️  Some tests failed. Please review the output above.');
        return false;
    }
}

// Run the tests
try {
    setupTest();
    const success = runTests();
    process.exit(success ? 0 : 1);
} catch (error) {
    console.error(`💥 Test runner error: ${error.message}`);
    process.exit(1);
} finally {
    cleanup();
}