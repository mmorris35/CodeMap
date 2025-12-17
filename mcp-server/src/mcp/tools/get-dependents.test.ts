/**
 * Tests for get_dependents MCP tool
 * Comprehensive tests for dependency analysis functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDependents, handleGetDependents } from './get-dependents';
import type { CodeMapStorage, CodeMap } from '../../storage';

// Mock CodeMap data for testing
const mockCodeMap: CodeMap = {
  version: '1.0',
  generated_at: '2024-12-17T00:00:00Z',
  source_root: '/app',
  symbols: [
    {
      qualified_name: 'auth.validate_token',
      kind: 'function',
      file: 'auth.py',
      line: 10,
      docstring: 'Validate JWT token',
    },
    {
      qualified_name: 'auth.decode_jwt',
      kind: 'function',
      file: 'auth.py',
      line: 20,
      docstring: 'Decode JWT',
    },
    {
      qualified_name: 'api.login',
      kind: 'function',
      file: 'api.py',
      line: 30,
      docstring: 'Login endpoint',
    },
    {
      qualified_name: 'api.protected',
      kind: 'function',
      file: 'api.py',
      line: 40,
      docstring: 'Protected endpoint',
    },
    {
      qualified_name: 'middleware.check_auth',
      kind: 'function',
      file: 'middleware.py',
      line: 50,
      docstring: 'Check authentication',
    },
    {
      qualified_name: 'services.user_service',
      kind: 'class',
      file: 'services.py',
      line: 60,
      docstring: 'User service',
    },
  ],
  dependencies: [
    // auth.validate_token is called by api.login and api.protected
    {
      from_sym: 'api.login',
      to_sym: 'auth.validate_token',
      kind: 'calls',
    },
    {
      from_sym: 'api.protected',
      to_sym: 'auth.validate_token',
      kind: 'calls',
    },
    // middleware.check_auth calls auth.validate_token
    {
      from_sym: 'middleware.check_auth',
      to_sym: 'auth.validate_token',
      kind: 'calls',
    },
    // api.login calls auth.decode_jwt
    {
      from_sym: 'api.login',
      to_sym: 'auth.decode_jwt',
      kind: 'calls',
    },
    // middleware.check_auth calls api.protected
    {
      from_sym: 'middleware.check_auth',
      to_sym: 'api.protected',
      kind: 'calls',
    },
    // services.user_service calls api.login (transitive)
    {
      from_sym: 'services.user_service',
      to_sym: 'api.login',
      kind: 'calls',
    },
  ],
};

// Create mock storage
const createMockStorage = (codeMapData?: CodeMap): CodeMapStorage => {
  return {
    saveCodeMap: vi.fn(),
    getCodeMap: vi.fn().mockResolvedValue(codeMapData || mockCodeMap),
    deleteCodeMap: vi.fn(),
    listProjects: vi.fn(),
    saveCache: vi.fn(),
    getCache: vi.fn(),
    deleteCache: vi.fn(),
  } as unknown as CodeMapStorage;
};

describe('getDependents tool', () => {
  let storage: CodeMapStorage;
  const userId = 'test-user';
  const projectId = 'test-project';

  beforeEach(() => {
    storage = createMockStorage();
  });

  describe('Direct dependents', () => {
    it('should find all direct callers of a symbol', async () => {
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(result.direct).toHaveLength(3);
      expect(result.direct.map((d) => d.symbol)).toContain('api.login');
      expect(result.direct.map((d) => d.symbol)).toContain('api.protected');
      expect(result.direct.map((d) => d.symbol)).toContain('middleware.check_auth');
    });

    it('should include file and line information for direct dependents', async () => {
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(result.direct[0].file).toBeDefined();
      expect(typeof result.direct[0].file).toBe('string');
      expect(result.direct[0].line).toBeGreaterThan(0);
    });

    it('should return empty direct list for symbol with no callers', async () => {
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'services.user_service'
      );

      expect(result.direct).toHaveLength(0);
    });

    it('should correctly map symbols to their file locations', async () => {
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      const loginCaller = result.direct.find((d) => d.symbol === 'api.login');
      expect(loginCaller?.file).toBe('api.py');
      expect(loginCaller?.line).toBe(30);
    });
  });

  describe('Transitive dependents', () => {
    it('should find transitive dependents (BFS)', async () => {
      // auth.validate_token <- api.login <- services.user_service
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(result.transitive).toHaveLength(1);
      expect(result.transitive[0].symbol).toBe('services.user_service');
    });

    it('should not include direct dependents in transitive list', async () => {
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      const directSymbols = result.direct.map((d) => d.symbol);
      const transitiveSymbols = result.transitive.map((t) => t.symbol);

      expect(transitiveSymbols).not.toEqual(
        expect.arrayContaining(directSymbols)
      );
    });

    it('should have correct total count', async () => {
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(result.total).toBe(result.direct.length + result.transitive.length);
      expect(result.total).toBe(4); // 3 direct + 1 transitive
    });

    it('should include file and line info for transitive dependents', async () => {
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      if (result.transitive.length > 0) {
        expect(result.transitive[0].file).toBeDefined();
        expect(result.transitive[0].line).toBeGreaterThan(0);
      }
    });
  });

  describe('Depth parameter', () => {
    it('should limit traversal to specified depth', async () => {
      // depth=1 should only return direct callers
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token',
        1
      );

      expect(result.transitive).toHaveLength(0);
      expect(result.direct).toHaveLength(3);
    });

    it('should return transitive with depth=2', async () => {
      // depth=2 should include direct and 1 level of transitive
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token',
        2
      );

      expect(result.direct).toHaveLength(3);
      expect(result.transitive.length).toBeGreaterThan(0);
    });

    it('should handle depth=0 (unlimited)', async () => {
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token',
        0
      );

      // With depth=0, unlimited traversal - should include all transitive dependents
      expect(result.direct).toHaveLength(3);
      expect(result.transitive).toHaveLength(1);
      expect(result.total).toBe(4);
    });
  });

  describe('Error handling', () => {
    it('should throw error if project not found', async () => {
      const emptyStorage = createMockStorage(null as any);
      vi.mocked(emptyStorage.getCodeMap).mockResolvedValueOnce(null);

      await expect(
        getDependents(emptyStorage, userId, projectId, 'auth.validate_token')
      ).rejects.toThrow('Project not found');
    });

    it('should throw error if symbol not found', async () => {
      await expect(
        getDependents(storage, userId, projectId, 'nonexistent.symbol')
      ).rejects.toThrow('Symbol not found');
    });

    it('should include project ID in error message', async () => {
      const emptyStorage = createMockStorage(null as any);
      vi.mocked(emptyStorage.getCodeMap).mockResolvedValueOnce(null);

      try {
        await getDependents(emptyStorage, userId, 'my-project', 'symbol');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('my-project');
      }
    });

    it('should include symbol in error message', async () => {
      try {
        await getDependents(storage, userId, projectId, 'my.symbol');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('my.symbol');
      }
    });
  });

  describe('Response format', () => {
    it('should return symbol in result', async () => {
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(result.symbol).toBe('auth.validate_token');
    });

    it('should have direct array', async () => {
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(Array.isArray(result.direct)).toBe(true);
    });

    it('should have transitive array', async () => {
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(Array.isArray(result.transitive)).toBe(true);
    });

    it('should have total count', async () => {
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(typeof result.total).toBe('number');
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it('should have proper structure for dependent objects', async () => {
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      result.direct.forEach((dep) => {
        expect(dep).toHaveProperty('symbol');
        expect(dep).toHaveProperty('file');
        expect(dep).toHaveProperty('line');
        expect(typeof dep.symbol).toBe('string');
        expect(typeof dep.file).toBe('string');
        expect(typeof dep.line).toBe('number');
      });
    });
  });

  describe('Edge cases', () => {
    it('should return empty result for symbol with no dependents', async () => {
      const emptyCodeMap: CodeMap = {
        ...mockCodeMap,
        dependencies: [],
      };
      const emptyStorage = createMockStorage(emptyCodeMap);

      const result = await getDependents(
        emptyStorage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(result.direct).toHaveLength(0);
      expect(result.transitive).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle symbols with dots in their names', async () => {
      const result = await getDependents(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(result.symbol).toBe('auth.validate_token');
    });

    it('should handle circular dependencies gracefully', async () => {
      const circularCodeMap: CodeMap = {
        ...mockCodeMap,
        dependencies: [
          ...mockCodeMap.dependencies,
          // Create circular: api.login -> auth.validate_token -> api.login
          {
            from_sym: 'auth.validate_token',
            to_sym: 'api.login',
            kind: 'calls',
          },
        ],
      };
      const circularStorage = createMockStorage(circularCodeMap);

      // Should not infinite loop
      const result = await getDependents(
        circularStorage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(result.total).toBeGreaterThan(0);
      // Check for duplicates (should have none)
      const allSymbols = [
        ...result.direct.map((d) => d.symbol),
        ...result.transitive.map((t) => t.symbol),
      ];
      const uniqueSymbols = new Set(allSymbols);
      expect(uniqueSymbols.size).toBe(allSymbols.length);
    });

    it('should use userId for storage access', async () => {
      await getDependents(storage, 'specific-user-id', projectId, 'auth.validate_token');

      expect(vi.mocked(storage.getCodeMap)).toHaveBeenCalledWith(
        'specific-user-id',
        projectId
      );
    });
  });
});

describe('handleGetDependents (MCP handler)', () => {
  let storage: CodeMapStorage;
  const userId = 'test-user';

  beforeEach(() => {
    storage = createMockStorage();
  });

  describe('Valid arguments', () => {
    it('should return successful response for valid arguments', async () => {
      const args = {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0].type).toBe('text');
      expect(response.isError).not.toBe(true);
    });

    it('should include result as JSON in response', async () => {
      const args = {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
      };

      const response = await handleGetDependents(storage, userId, args);

      const responseText = response.content[0].text || '';
      const parsed = JSON.parse(responseText);

      expect(parsed).toHaveProperty('symbol');
      expect(parsed).toHaveProperty('direct');
      expect(parsed).toHaveProperty('transitive');
      expect(parsed).toHaveProperty('total');
    });

    it('should handle optional depth parameter', async () => {
      const args = {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
        depth: 1,
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response.isError).not.toBe(true);
      expect(response.content[0].type).toBe('text');
    });
  });

  describe('Invalid arguments', () => {
    it('should return error for missing project_id', async () => {
      const args = {
        symbol: 'auth.validate_token',
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('project_id');
    });

    it('should return error for missing symbol', async () => {
      const args = {
        project_id: 'test-project',
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('symbol');
    });

    it('should return error for empty project_id string', async () => {
      const args = {
        project_id: '',
        symbol: 'auth.validate_token',
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('project_id');
    });

    it('should return error for empty symbol string', async () => {
      const args = {
        project_id: 'test-project',
        symbol: '',
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('symbol');
    });

    it('should return error for invalid depth type', async () => {
      const args = {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
        depth: 'invalid',
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('depth');
    });

    it('should return error for negative depth', async () => {
      const args = {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
        depth: -1,
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('depth');
    });

    it('should return error for non-string project_id', async () => {
      const args = {
        project_id: 123,
        symbol: 'auth.validate_token',
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('project_id');
    });

    it('should return error for non-string symbol', async () => {
      const args = {
        project_id: 'test-project',
        symbol: 123,
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('symbol');
    });
  });

  describe('Error handling', () => {
    it('should catch and format storage errors', async () => {
      const errorStorage = createMockStorage();
      vi.mocked(errorStorage.getCodeMap).mockRejectedValueOnce(
        new Error('Storage error')
      );

      const args = {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
      };

      const response = await handleGetDependents(errorStorage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Error');
    });

    it('should handle symbol not found error', async () => {
      const args = {
        project_id: 'test-project',
        symbol: 'nonexistent.symbol',
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Symbol not found');
    });

    it('should handle project not found error', async () => {
      const emptyStorage = createMockStorage(null as any);
      vi.mocked(emptyStorage.getCodeMap).mockResolvedValueOnce(null);

      const args = {
        project_id: 'nonexistent-project',
        symbol: 'auth.validate_token',
      };

      const response = await handleGetDependents(emptyStorage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Project not found');
    });
  });

  describe('Response format', () => {
    it('should return ToolCallResponse with content array', async () => {
      const args = {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content.length).toBeGreaterThan(0);
    });

    it('should have text type content', async () => {
      const args = {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response.content[0].type).toBe('text');
      expect(response.content[0].text).toBeDefined();
    });

    it('should set isError flag for errors', async () => {
      const args = {
        symbol: 'auth.validate_token',
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response.isError).toBe(true);
    });

    it('should not set isError for success', async () => {
      const args = {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
      };

      const response = await handleGetDependents(storage, userId, args);

      expect(response.isError).not.toBe(true);
    });
  });
});
