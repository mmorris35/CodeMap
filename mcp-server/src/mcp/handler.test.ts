/**
 * Tests for MCP Protocol Handler
 * Comprehensive tests for JSON-RPC 2.0 message handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMcpRequest } from './handler';
import type { CodeMapStorage } from '../storage';

// Mock storage
const createMockStorage = (): CodeMapStorage => {
  return {
    saveCodeMap: vi.fn(),
    getCodeMap: vi.fn(),
    deleteCodeMap: vi.fn(),
    listProjects: vi.fn(),
    saveCache: vi.fn(),
    getCache: vi.fn(),
    deleteCache: vi.fn(),
  } as unknown as CodeMapStorage;
};

describe('MCP Handler', () => {
  let storage: CodeMapStorage;
  const userId = 'test-user';

  beforeEach(() => {
    storage = createMockStorage();
  });

  describe('Request parsing', () => {
    it('should handle string JSON requests', async () => {
      const request = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      });

      const response = await handleMcpRequest(request, storage, userId);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect('result' in response).toBe(true);
    });

    it('should handle object requests', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      };

      const response = await handleMcpRequest(request, storage, userId);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect('result' in response).toBe(true);
    });

    it('should return parse error for invalid JSON', async () => {
      const request = 'invalid json {';

      const response = await handleMcpRequest(request, storage, userId);

      expect(response.jsonrpc).toBe('2.0');
      expect('error' in response).toBe(true);
      const errorResponse = response as any;
      expect(errorResponse.error.code).toBe(-32700);
      expect(errorResponse.error.message).toContain('Parse error');
    });

    it('should return invalid request for non-object requests', async () => {
      const request = 'not an object';

      const response = await handleMcpRequest(request, storage, userId);

      expect('error' in response).toBe(true);
      const errorResponse = response as any;
      expect(errorResponse.error.code).toBe(-32700); // Parse error since it's a string
    });
  });

  describe('Request validation', () => {
    it('should reject requests without jsonrpc field', async () => {
      const request = {
        id: 1,
        method: 'initialize',
      };

      const response = await handleMcpRequest(request, storage, userId);

      expect('error' in response).toBe(true);
      const errorResponse = response as any;
      expect(errorResponse.error.code).toBe(-32600);
    });

    it('should reject requests without id field', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'initialize',
      };

      const response = await handleMcpRequest(request, storage, userId);

      expect('error' in response).toBe(true);
      const errorResponse = response as any;
      expect(errorResponse.error.code).toBe(-32600);
    });

    it('should reject requests without method field', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
      };

      const response = await handleMcpRequest(request, storage, userId);

      expect('error' in response).toBe(true);
    });

    it('should reject requests with non-string method', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 123,
      };

      const response = await handleMcpRequest(request, storage, userId);

      expect('error' in response).toBe(true);
    });

    it('should accept requests with null id', async () => {
      const request = {
        jsonrpc: '2.0',
        id: null,
        method: 'initialize',
      };

      const response = await handleMcpRequest(request, storage, userId);

      // Should accept null id (it's valid in JSON-RPC 2.0 for requests)
      expect(response.jsonrpc).toBe('2.0');
    });

    it('should accept requests with numeric id', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 42,
        method: 'initialize',
      };

      const response = await handleMcpRequest(request, storage, userId);

      expect(response.id).toBe(42);
    });

    it('should accept requests with string id', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 'abc-123',
        method: 'initialize',
      };

      const response = await handleMcpRequest(request, storage, userId);

      expect(response.id).toBe('abc-123');
    });
  });

  describe('initialize method', () => {
    it('should return server capabilities', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.result).toBeDefined();
      expect(response.result.protocolVersion).toBeDefined();
      expect(response.result.capabilities).toBeDefined();
      expect(response.result.serverInfo).toBeDefined();
    });

    it('should return server name and version', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.result.serverInfo.name).toBe('codemap-mcp');
      expect(response.result.serverInfo.version).toBe('1.0.0');
    });

    it('should include tools capability', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.result.capabilities.tools).toBeDefined();
    });

    it('should include resources capability', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.result.capabilities.resources).toBeDefined();
    });
  });

  describe('tools/list method', () => {
    it('should return list of tools', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.result).toBeDefined();
      expect(Array.isArray(response.result.tools)).toBe(true);
    });

    it('should return 4 tools', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.result.tools).toHaveLength(4);
    });

    it('should include get_dependents tool', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;
      const toolNames = response.result.tools.map((t: any) => t.name);

      expect(toolNames).toContain('get_dependents');
    });

    it('should include get_impact_report tool', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;
      const toolNames = response.result.tools.map((t: any) => t.name);

      expect(toolNames).toContain('get_impact_report');
    });

    it('should include check_breaking_change tool', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;
      const toolNames = response.result.tools.map((t: any) => t.name);

      expect(toolNames).toContain('check_breaking_change');
    });

    it('should include get_architecture tool', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;
      const toolNames = response.result.tools.map((t: any) => t.name);

      expect(toolNames).toContain('get_architecture');
    });

    it('should include tool descriptions', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      response.result.tools.forEach((tool: any) => {
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.description.length).toBeGreaterThan(0);
      });
    });

    it('should include input schemas for tools', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      response.result.tools.forEach((tool: any) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });
  });

  describe('resources/list method', () => {
    it('should return list of resources', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/list',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.result).toBeDefined();
      expect(Array.isArray(response.result.resources)).toBe(true);
    });

    it('should include codemap resource', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/list',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;
      const resourceUris = response.result.resources.map((r: any) => r.uri);

      expect(resourceUris).toContain('codemap://project');
    });

    it('should include resource descriptions', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/list',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      response.result.resources.forEach((resource: any) => {
        expect(resource.description).toBeDefined();
        expect(typeof resource.description).toBe('string');
      });
    });
  });

  describe('tools/call method', () => {
    it('should accept tool calls', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_dependents',
          arguments: {
            project_id: 'test-project',
            symbol: 'test.symbol',
          },
        },
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.result).toBeDefined();
    });

    it('should return error for missing name parameter', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          arguments: {
            project_id: 'test-project',
          },
        },
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect('error' in response).toBe(true);
      expect(response.error.code).toBe(-32602);
    });

    it('should return error for missing arguments parameter', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_dependents',
        },
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect('error' in response).toBe(true);
      expect(response.error.code).toBe(-32602);
    });

    it('should return error for unknown tool', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect('error' in response).toBe(true);
      expect(response.error.code).toBe(-32601);
    });

    it('should return error for invalid params type', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: 'not an object',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect('error' in response).toBe(true);
      // params being string instead of object is an invalid request from JSON-RPC perspective
      expect(response.error.code).toBe(-32600);
    });
  });

  describe('Unknown methods', () => {
    it('should return method not found error', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown_method',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect('error' in response).toBe(true);
      expect(response.error.code).toBe(-32601);
      expect(response.error.message).toContain('Method not found');
    });

    it('should include method name in error', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'nonexistent_method',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.error.message).toContain('nonexistent_method');
    });
  });

  describe('Response format', () => {
    it('should always include jsonrpc 2.0', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      };

      const response = await handleMcpRequest(request, storage, userId);

      expect(response.jsonrpc).toBe('2.0');
    });

    it('should always include request id', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'initialize',
      };

      const response = await handleMcpRequest(request, storage, userId);

      expect(response.id).toBe('test-id');
    });

    it('should include result for successful responses', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect('result' in response).toBe(true);
      expect(response.result).toBeDefined();
    });

    it('should not include result for error responses', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown_method',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect('result' in response).toBe(false);
      expect('error' in response).toBe(true);
    });

    it('should include error code for error responses', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown_method',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.error.code).toBeDefined();
      expect(typeof response.error.code).toBe('number');
    });

    it('should include error message for error responses', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown_method',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.error.message).toBeDefined();
      expect(typeof response.error.message).toBe('string');
    });
  });

  describe('Error codes', () => {
    it('should use -32700 for parse errors', async () => {
      const request = '{invalid json';

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.error.code).toBe(-32700);
    });

    it('should use -32600 for invalid requests', async () => {
      const request = {
        id: 1,
        method: 'initialize',
        // missing jsonrpc
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.error.code).toBe(-32600);
    });

    it('should use -32601 for method not found', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'nonexistent',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.error.code).toBe(-32601);
    });

    it('should use -32602 for invalid params in tool call', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          // valid params structure but missing required fields
        },
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect(response.error.code).toBe(-32602);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty request body', async () => {
      const request = '';

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect('error' in response).toBe(true);
    });

    it('should handle null request', async () => {
      const request = null;

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect('error' in response).toBe(true);
    });

    it('should handle numeric request', async () => {
      const request = 123;

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect('error' in response).toBe(true);
    });

    it('should handle request with extra fields', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        extra_field: 'should be ignored',
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect('result' in response).toBe(true);
    });

    it('should handle request with params: null', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: null,
      };

      const response = (await handleMcpRequest(request, storage, userId)) as any;

      expect('error' in response).toBe(true);
    });

    it('should preserve numeric ids correctly', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 999,
        method: 'initialize',
      };

      const response = await handleMcpRequest(request, storage, userId);

      expect(response.id).toBe(999);
    });

    it('should preserve string ids correctly', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 'uuid-1234-5678',
        method: 'initialize',
      };

      const response = await handleMcpRequest(request, storage, userId);

      expect(response.id).toBe('uuid-1234-5678');
    });
  });
});
