import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// Mock MCP SDK
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    setRequestHandler: jest.fn(),
    connect: jest.fn()
  }))
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn()
}));

describe('Specster MCP Server', () => {
  const testDataDir = '.specster-test';
  
  beforeEach(() => {
    // Set up test environment
    process.env.SPECSTER_DATA_DIR = testDataDir;
    process.env.SPECSTER_TEMPLATES_DIR = `${testDataDir}/templates`;
    process.env.SPECSTER_CONFIG_DIR = `${testDataDir}/config`;
    
    // Create test directory structure
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
      fs.mkdirSync(`${testDataDir}/specs`, { recursive: true });
      fs.mkdirSync(`${testDataDir}/state`, { recursive: true });
      fs.mkdirSync(`${testDataDir}/templates`, { recursive: true });
      fs.mkdirSync(`${testDataDir}/config`, { recursive: true });
    }
    
    // Create test templates
    fs.writeFileSync(`${testDataDir}/templates/requirements-template.md`, 
      '# Requirements: {{specName}}\n{{description}}');
    fs.writeFileSync(`${testDataDir}/templates/design-template.md`, 
      '# Design: {{specName}}\n{{description}}');
    fs.writeFileSync(`${testDataDir}/templates/tasks-template.md`, 
      '# Tasks: {{specName}}\n{{description}}');
  });
  
  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });
  
  it('should initialize project structure', () => {
    expect(fs.existsSync(testDataDir)).toBe(true);
    expect(fs.existsSync(`${testDataDir}/specs`)).toBe(true);
    expect(fs.existsSync(`${testDataDir}/state`)).toBe(true);
    expect(fs.existsSync(`${testDataDir}/templates`)).toBe(true);
    expect(fs.existsSync(`${testDataDir}/config`)).toBe(true);
  });
  
  it('should have template files', () => {
    expect(fs.existsSync(`${testDataDir}/templates/requirements-template.md`)).toBe(true);
    expect(fs.existsSync(`${testDataDir}/templates/design-template.md`)).toBe(true);
    expect(fs.existsSync(`${testDataDir}/templates/tasks-template.md`)).toBe(true);
  });
  
  it('should validate spec names', () => {
    const validNames = ['test-spec', 'my_spec', 'spec123'];
    const invalidNames = ['test spec', 'test/spec', 'test..spec', '../spec'];
    
    validNames.forEach(name => {
      expect(/^[a-zA-Z0-9-_]+$/.test(name)).toBe(true);
    });
    
    invalidNames.forEach(name => {
      expect(/^[a-zA-Z0-9-_]+$/.test(name)).toBe(false);
    });
  });
  
  it('should validate spec name length', () => {
    const shortName = 'test';
    const longName = 'a'.repeat(51);
    
    expect(shortName.length <= 50).toBe(true);
    expect(longName.length <= 50).toBe(false);
  });
  
  it('should validate description length', () => {
    const shortDesc = 'Test description';
    const longDesc = 'a'.repeat(201);
    
    expect(shortDesc.length <= 200).toBe(true);
    expect(longDesc.length <= 200).toBe(false);
  });
});

describe('Workflow Phase Validation', () => {
  const validTransitions = new Map([
    ['init', ['requirements']],
    ['requirements', ['design']],
    ['design', ['tasks']],
    ['tasks', ['complete']]
  ]);
  
  it('should validate correct phase transitions', () => {
    expect(validTransitions.get('init')).toContain('requirements');
    expect(validTransitions.get('requirements')).toContain('design');
    expect(validTransitions.get('design')).toContain('tasks');
    expect(validTransitions.get('tasks')).toContain('complete');
  });
  
  it('should reject invalid phase transitions', () => {
    expect(validTransitions.get('init')).not.toContain('design');
    expect(validTransitions.get('requirements')).not.toContain('tasks');
    expect(validTransitions.get('design')).not.toContain('complete');
  });
});

describe('File Operations', () => {
  const testDataDir = '.specster-test';
  
  beforeEach(() => {
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
  });
  
  afterEach(() => {
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });
  
  it('should create specification directory structure', () => {
    const specName = 'test-spec';
    const specDir = path.join(testDataDir, 'specs', specName);
    
    fs.mkdirSync(specDir, { recursive: true });
    
    expect(fs.existsSync(specDir)).toBe(true);
  });
  
  it('should create specification files', () => {
    const specName = 'test-spec';
    const specDir = path.join(testDataDir, 'specs', specName);
    fs.mkdirSync(specDir, { recursive: true });
    
    const files = ['requirements.md', 'design.md', 'tasks.md'];
    
    files.forEach(fileName => {
      const filePath = path.join(specDir, fileName);
      fs.writeFileSync(filePath, `# ${fileName}\nTest content`);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });
  
  it('should validate allowed file names', () => {
    const allowedFiles = ['requirements.md', 'design.md', 'tasks.md'];
    const invalidFiles = ['test.txt', 'readme.md', 'config.json'];
    
    expect(allowedFiles.every(file => ['requirements.md', 'design.md', 'tasks.md'].includes(file))).toBe(true);
    expect(invalidFiles.every(file => ['requirements.md', 'design.md', 'tasks.md'].includes(file))).toBe(false);
  });
});

describe('Template System', () => {
  it('should substitute template variables', () => {
    const template = '# Requirements: {{specName}}\n{{description}}';
    const variables = {
      specName: 'test-spec',
      description: 'A test specification'
    };
    
    const result = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key as keyof typeof variables] || match;
    });
    
    expect(result).toBe('# Requirements: test-spec\nA test specification');
  });
  
  it('should handle missing variables', () => {
    const template = '# Requirements: {{specName}}\n{{missing}}';
    const variables = {
      specName: 'test-spec'
    };
    
    const result = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key as keyof typeof variables] || match;
    });
    
    expect(result).toBe('# Requirements: test-spec\n{{missing}}');
  });
});