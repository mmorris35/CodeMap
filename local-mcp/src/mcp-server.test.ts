/**
 * Tests for MCP Server implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { McpServer } from './mcp-server.js';
import { saveCodeMap } from './analyzer.js';
import type { CodeMap } from './types.js';

describe('McpServer', () => {
  let tempHome: string;
  let originalHome: string | undefined;
  let server: McpServer;

  beforeEach(() => {
    // Setup temp home for storage
    originalHome = process.env.HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    process.env.HOME = tempHome;

    server = new McpServer();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  describe('loadProject', () => {
    it('should load existing project', () => {
      const codeMap: CodeMap = {
        version: '1.0',
        generated_at: new Date().toISOString(),
        source_root: '/test',
        symbols: [
          { qualified_name: 'main.func', kind: 'function', file: 'main.py', line: 1, docstring: null },
        ],
        dependencies: [],
      };

      saveCodeMap('test-project', codeMap);

      const result = server.loadProject('test-project');
      expect(result).toBe(true);
    });

    it('should return false for non-existent project', () => {
      const result = server.loadProject('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('handleRequest - initialize', () => {
    it('should return server info on initialize', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'initialize',
        params: {},
      };

      // Access private method for testing
      const response = await (server as any).handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.serverInfo.name).toBe('codemap-mcp');
      expect(response.result.capabilities).toBeDefined();
    });
  });

  describe('handleRequest - tools/list', () => {
    it('should return list of tools', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/list',
        params: {},
      };

      const response = await (server as any).handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeDefined();
      expect(Array.isArray(response.result.tools)).toBe(true);
      expect(response.result.tools.length).toBeGreaterThan(0);

      const toolNames = response.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('get_dependents');
      expect(toolNames).toContain('get_impact_report');
      expect(toolNames).toContain('check_breaking_change');
      expect(toolNames).toContain('get_architecture');
      expect(toolNames).toContain('analyze_project');
    });
  });

  describe('handleRequest - resources/list', () => {
    it('should return list of resources', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'resources/list',
        params: {},
      };

      const response = await (server as any).handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.resources).toBeDefined();
      expect(Array.isArray(response.result.resources)).toBe(true);
    });
  });

  describe('handleRequest - method not found', () => {
    it('should return error for unknown method', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'unknown/method',
        params: {},
      };

      const response = await (server as any).handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32601);
    });
  });

  describe('handleRequest - tools/call', () => {
    beforeEach(() => {
      // Save a test code map
      const codeMap: CodeMap = {
        version: '1.0',
        generated_at: new Date().toISOString(),
        source_root: '/test',
        symbols: [
          { qualified_name: 'main.run', kind: 'function', file: 'main.py', line: 5, docstring: null, signature: 'def run()' },
          { qualified_name: 'auth.validate', kind: 'function', file: 'auth.py', line: 10, docstring: null, signature: 'def validate(user, password)' },
        ],
        dependencies: [
          { from_sym: 'main.run', to_sym: 'auth.validate', kind: 'calls' },
        ],
      };

      saveCodeMap('test-project', codeMap);
      server.loadProject('test-project');
    });

    it('should call get_dependents tool', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_dependents',
          arguments: { symbol: 'auth.validate' },
        },
      };

      const response = await (server as any).handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.content).toBeDefined();
      expect(response.result.isError).not.toBe(true);
    });

    it('should call get_impact_report tool', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_impact_report',
          arguments: { symbol: 'auth.validate', include_tests: true },
        },
      };

      const response = await (server as any).handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.content).toBeDefined();
    });

    it('should call check_breaking_change tool', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/call',
        params: {
          name: 'check_breaking_change',
          arguments: {
            symbol: 'auth.validate',
            new_signature: 'def validate(user, password, token)',
          },
        },
      };

      const response = await (server as any).handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.content).toBeDefined();
    });

    it('should call get_architecture tool', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_architecture',
          arguments: { level: 'module' },
        },
      };

      const response = await (server as any).handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.content).toBeDefined();
    });

    it('should return error for unknown tool', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      };

      const response = await (server as any).handleRequest(request);

      expect(response.result.isError).toBe(true);
      expect(response.result.content[0].text).toContain('Unknown tool');
    });

    it('should return error for missing tool name', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/call',
        params: {},
      };

      const response = await (server as any).handleRequest(request);

      expect(response.result.isError).toBe(true);
    });

    it('should return error for missing required parameter', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_dependents',
          arguments: {}, // Missing 'symbol'
        },
      };

      const response = await (server as any).handleRequest(request);

      expect(response.result.isError).toBe(true);
      expect(response.result.content[0].text).toContain('symbol');
    });
  });

  describe('handleRequest - resources/read', () => {
    beforeEach(() => {
      const codeMap: CodeMap = {
        version: '1.0',
        generated_at: new Date().toISOString(),
        source_root: '/test',
        symbols: [
          { qualified_name: 'main.func', kind: 'function', file: 'main.py', line: 1, docstring: null },
          { qualified_name: 'Main', kind: 'class', file: 'main.py', line: 10, docstring: null },
          { qualified_name: 'Main.method', kind: 'method', file: 'main.py', line: 15, docstring: null },
        ],
        dependencies: [],
      };

      saveCodeMap('test-project', codeMap);
      server.loadProject('test-project');
    });

    it('should read code_map resource', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'resources/read',
        params: { uri: 'codemap://current/code_map' },
      };

      const response = await (server as any).handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.contents).toBeDefined();
      expect(response.result.contents[0].mimeType).toBe('application/json');
    });

    it('should read summary resource', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'resources/read',
        params: { uri: 'codemap://current/summary' },
      };

      const response = await (server as any).handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.contents).toBeDefined();
      expect(response.result.contents[0].mimeType).toBe('text/plain');
      expect(response.result.contents[0].text).toContain('Project Summary');
    });

    it('should error for unknown resource', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'resources/read',
        params: { uri: 'codemap://unknown/resource' },
      };

      const response = await (server as any).handleRequest(request);

      expect(response.error).toBeDefined();
    });

    it('should error when missing URI', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'resources/read',
        params: {},
      };

      const response = await (server as any).handleRequest(request);

      expect(response.error).toBeDefined();
    });
  });

  describe('ensureCodeMap', () => {
    it('should throw when no project loaded', () => {
      expect(() => (server as any).ensureCodeMap()).toThrow();
    });

    it('should return loaded code map', () => {
      const codeMap: CodeMap = {
        version: '1.0',
        generated_at: new Date().toISOString(),
        source_root: '/test',
        symbols: [],
        dependencies: [],
      };

      saveCodeMap('test-project', codeMap);
      server.loadProject('test-project');

      const result = (server as any).ensureCodeMap();
      expect(result).toBeDefined();
      expect(result.version).toBe('1.0');
    });
  });

  describe('tool definitions', () => {
    it('should have valid input schemas', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/list',
        params: {},
      };

      const response = await (server as any).handleRequest(request);
      const tools = response.result.tools;

      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });
});

describe('analyze_project tool', () => {
  let tempDir: string;
  let tempHome: string;
  let originalHome: string | undefined;
  let server: McpServer;

  beforeEach(() => {
    // Setup temp directories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analyze-test-'));
    originalHome = process.env.HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-home-'));
    process.env.HOME = tempHome;

    server = new McpServer();

    // Create a sample Python file
    fs.writeFileSync(
      path.join(tempDir, 'main.py'),
      `def hello():
    pass

def world():
    hello()
`
    );
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('should analyze project', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: {
        name: 'analyze_project',
        arguments: { path: tempDir },
      },
    };

    const response = await (server as any).handleRequest(request);

    expect(response.result).toBeDefined();
    expect(response.result.isError).not.toBe(true);

    const content = JSON.parse(response.result.content[0].text);
    expect(content.success).toBe(true);
    expect(content.symbols_count).toBeGreaterThan(0);
  });

  it('should use custom project_id', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: {
        name: 'analyze_project',
        arguments: { path: tempDir, project_id: 'my-custom-project' },
      },
    };

    const response = await (server as any).handleRequest(request);

    const content = JSON.parse(response.result.content[0].text);
    expect(content.project_id).toBe('my-custom-project');
  });

  it('should return error for missing path', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: {
        name: 'analyze_project',
        arguments: {},
      },
    };

    const response = await (server as any).handleRequest(request);

    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].text).toContain('path');
  });
});
