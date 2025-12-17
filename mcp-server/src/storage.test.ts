/**
 * Tests for CodeMapStorage - KV storage wrapper
 * Tests all storage operations with mocked KV namespace
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodeMapStorage, CodeMapSchema, type CodeMap } from './storage';

/**
 * Mock KV namespace for testing
 */
class MockKVNamespace {
  private store: Map<string, { value: string; expirationTtl?: number }> = new Map();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, {
      value,
      expirationTtl: options?.expirationTtl,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean }> {
    const prefix = options?.prefix || '';
    const keys = Array.from(this.store.keys())
      .filter((key) => key.startsWith(prefix))
      .map((name) => ({ name }));

    return {
      keys,
      list_complete: true,
    };
  }
}

/**
 * Sample valid CodeMap for testing
 */
const SAMPLE_CODEMAP: CodeMap = {
  version: '1.0',
  generated_at: '2024-01-01T00:00:00Z',
  source_root: '/project/src',
  symbols: [
    {
      qualified_name: 'auth.validate',
      kind: 'function',
      file: '/project/src/auth.py',
      line: 42,
      docstring: 'Validates user credentials',
      signature: 'validate(username: str, password: str) -> bool',
    },
    {
      qualified_name: 'auth.login',
      kind: 'function',
      file: '/project/src/auth.py',
      line: 60,
      docstring: 'Handles user login',
    },
    {
      qualified_name: 'db.query',
      kind: 'function',
      file: '/project/src/db.py',
      line: 10,
    },
  ],
  dependencies: [
    {
      from_sym: 'auth.login',
      to_sym: 'auth.validate',
      kind: 'calls',
      locations: [
        {
          file: '/project/src/auth.py',
          line: 65,
        },
      ],
    },
    {
      from_sym: 'auth.validate',
      to_sym: 'db.query',
      kind: 'calls',
    },
  ],
};

describe('CodeMapStorage', () => {
  let mockKV: MockKVNamespace;
  let storage: CodeMapStorage;

  beforeEach(() => {
    mockKV = new MockKVNamespace();
    storage = new CodeMapStorage(mockKV as unknown as KVNamespace);
  });

  describe('saveCodeMap', () => {
    it('should save valid CodeMap to KV', async () => {
      await storage.saveCodeMap('user1', 'project1', SAMPLE_CODEMAP);
      const stored = await mockKV.get('user:user1:project:project1');
      expect(stored).toBeDefined();
      expect(JSON.parse(stored!)).toEqual(SAMPLE_CODEMAP);
    });

    it('should use user-scoped key format', async () => {
      await storage.saveCodeMap('alice', 'my-app', SAMPLE_CODEMAP);
      const stored = await mockKV.get('user:alice:project:my-app');
      expect(stored).toBeDefined();
    });

    it('should validate CodeMap schema before saving', async () => {
      const invalid = { ...SAMPLE_CODEMAP, version: 'invalid' };
      await expect(storage.saveCodeMap('user1', 'project1', invalid)).rejects.toThrow();
    });

    it('should reject missing required fields', async () => {
      const incomplete = { ...SAMPLE_CODEMAP };
      delete (incomplete as any).version;
      await expect(storage.saveCodeMap('user1', 'project1', incomplete)).rejects.toThrow();
    });

    it('should preserve all CodeMap fields when saving', async () => {
      const codeMapWithOptionals: CodeMap = {
        ...SAMPLE_CODEMAP,
        schema: 'https://example.com/schema.json',
        symbols: [
          ...SAMPLE_CODEMAP.symbols,
          {
            qualified_name: 'utils.helper',
            kind: 'function',
            file: '/project/src/utils.py',
            line: 5,
            column: 0,
            task_links: ['1.2.3'],
          },
        ],
      };

      await storage.saveCodeMap('user1', 'project1', codeMapWithOptionals);
      const stored = await mockKV.get('user:user1:project:project1');
      const retrieved = JSON.parse(stored!);

      expect(retrieved.schema).toBe('https://example.com/schema.json');
      expect(retrieved.symbols[3].column).toBe(0);
      expect(retrieved.symbols[3].task_links).toEqual(['1.2.3']);
    });

    it('should allow different users to have same project ID', async () => {
      const codeMap1 = { ...SAMPLE_CODEMAP, version: '1.1' };
      const codeMap2 = { ...SAMPLE_CODEMAP, version: '2.0' };

      await storage.saveCodeMap('user1', 'my-app', codeMap1);
      await storage.saveCodeMap('user2', 'my-app', codeMap2);

      const stored1 = JSON.parse((await mockKV.get('user:user1:project:my-app'))!);
      const stored2 = JSON.parse((await mockKV.get('user:user2:project:my-app'))!);

      expect(stored1.version).toBe('1.1');
      expect(stored2.version).toBe('2.0');
    });
  });

  describe('getCodeMap', () => {
    it('should retrieve saved CodeMap', async () => {
      await storage.saveCodeMap('user1', 'project1', SAMPLE_CODEMAP);
      const retrieved = await storage.getCodeMap('user1', 'project1');

      expect(retrieved).toEqual(SAMPLE_CODEMAP);
    });

    it('should return null for non-existent project', async () => {
      const retrieved = await storage.getCodeMap('user1', 'nonexistent');
      expect(retrieved).toBeNull();
    });

    it('should not retrieve other users projects', async () => {
      await storage.saveCodeMap('user1', 'project1', SAMPLE_CODEMAP);
      const retrieved = await storage.getCodeMap('user2', 'project1');
      expect(retrieved).toBeNull();
    });

    it('should validate retrieved data', async () => {
      // Store invalid data directly in KV
      await mockKV.put('user:user1:project:project1', JSON.stringify({ invalid: 'data' }));

      await expect(storage.getCodeMap('user1', 'project1')).rejects.toThrow();
    });

    it('should preserve all fields when retrieving', async () => {
      const codeMapWithOptionals: CodeMap = {
        ...SAMPLE_CODEMAP,
        schema: 'https://example.com/schema.json',
        symbols: [
          {
            qualified_name: 'module.func',
            kind: 'function',
            file: 'file.py',
            line: 10,
            column: 5,
            docstring: 'Test',
            signature: 'func()',
            task_links: ['1.2.3', '4.5.6'],
          },
        ],
      };

      await storage.saveCodeMap('user1', 'project1', codeMapWithOptionals);
      const retrieved = await storage.getCodeMap('user1', 'project1');

      expect(retrieved?.schema).toBe('https://example.com/schema.json');
      expect(retrieved?.symbols[0].column).toBe(5);
      expect(retrieved?.symbols[0].task_links).toEqual(['1.2.3', '4.5.6']);
    });
  });

  describe('deleteCodeMap', () => {
    it('should delete existing CodeMap', async () => {
      await storage.saveCodeMap('user1', 'project1', SAMPLE_CODEMAP);
      await storage.deleteCodeMap('user1', 'project1');

      const retrieved = await storage.getCodeMap('user1', 'project1');
      expect(retrieved).toBeNull();
    });

    it('should be safe to call on non-existent project', async () => {
      // Should not throw
      await expect(storage.deleteCodeMap('user1', 'nonexistent')).resolves.not.toThrow();
    });

    it('should only delete user-scoped project', async () => {
      const codeMap1 = { ...SAMPLE_CODEMAP, version: '1.1' };
      const codeMap2 = { ...SAMPLE_CODEMAP, version: '2.0' };

      await storage.saveCodeMap('user1', 'project1', codeMap1);
      await storage.saveCodeMap('user2', 'project1', codeMap2);

      await storage.deleteCodeMap('user1', 'project1');

      const deleted = await storage.getCodeMap('user1', 'project1');
      const remaining = await storage.getCodeMap('user2', 'project1');

      expect(deleted).toBeNull();
      expect(remaining).not.toBeNull();
    });
  });

  describe('listProjects', () => {
    it('should list user projects', async () => {
      await storage.saveCodeMap('user1', 'app1', SAMPLE_CODEMAP);
      await storage.saveCodeMap('user1', 'app2', SAMPLE_CODEMAP);
      await storage.saveCodeMap('user1', 'app3', SAMPLE_CODEMAP);

      const projects = await storage.listProjects('user1');
      expect(projects).toEqual(['app1', 'app2', 'app3']);
    });

    it('should return empty array for user with no projects', async () => {
      const projects = await storage.listProjects('user1');
      expect(projects).toEqual([]);
    });

    it('should not list other users projects', async () => {
      await storage.saveCodeMap('user1', 'app1', SAMPLE_CODEMAP);
      await storage.saveCodeMap('user1', 'app2', SAMPLE_CODEMAP);
      await storage.saveCodeMap('user2', 'app1', SAMPLE_CODEMAP);
      await storage.saveCodeMap('user2', 'app3', SAMPLE_CODEMAP);

      const user1Projects = await storage.listProjects('user1');
      const user2Projects = await storage.listProjects('user2');

      expect(user1Projects).toEqual(['app1', 'app2']);
      expect(user2Projects).toEqual(['app1', 'app3']);
    });

    it('should handle user IDs with special characters', async () => {
      const userId = 'user:with:colons';
      await storage.saveCodeMap(userId, 'project1', SAMPLE_CODEMAP);

      const projects = await storage.listProjects(userId);
      expect(projects).toContain('project1');
    });

    it('should return consistent results on multiple calls', async () => {
      await storage.saveCodeMap('user1', 'app1', SAMPLE_CODEMAP);
      await storage.saveCodeMap('user1', 'app2', SAMPLE_CODEMAP);

      const list1 = await storage.listProjects('user1');
      const list2 = await storage.listProjects('user1');

      expect(list1).toEqual(list2);
    });
  });

  describe('saveCache', () => {
    it('should save cache with default TTL', async () => {
      const data = { result: 'cached data' };
      await storage.saveCache('user1', 'query-hash-1', data);

      const stored = await mockKV.get('user:user1:cache:query-hash-1');
      expect(stored).toBeDefined();
      expect(JSON.parse(stored!)).toEqual(data);
    });

    it('should save cache with custom TTL', async () => {
      const data = { result: 'cached data' };
      const putSpy = vi.spyOn(mockKV, 'put');

      await storage.saveCache('user1', 'query-hash-1', data, 7200);

      expect(putSpy).toHaveBeenCalledWith(
        'user:user1:cache:query-hash-1',
        JSON.stringify(data),
        expect.objectContaining({ expirationTtl: 7200 })
      );
    });

    it('should use user-scoped cache key', async () => {
      await storage.saveCache('alice', 'query-hash', { data: 'test' });

      const stored = await mockKV.get('user:alice:cache:query-hash');
      expect(stored).toBeDefined();
    });

    it('should allow different users to cache same query', async () => {
      const data1 = { result: 'user1 result' };
      const data2 = { result: 'user2 result' };

      await storage.saveCache('user1', 'query-hash', data1);
      await storage.saveCache('user2', 'query-hash', data2);

      const cached1 = JSON.parse((await mockKV.get('user:user1:cache:query-hash'))!);
      const cached2 = JSON.parse((await mockKV.get('user:user2:cache:query-hash'))!);

      expect(cached1).toEqual(data1);
      expect(cached2).toEqual(data2);
    });
  });

  describe('getCache', () => {
    it('should retrieve cached data', async () => {
      const data = { symbols: ['auth.validate', 'db.query'] };
      await storage.saveCache('user1', 'query-hash', data);

      const cached = await storage.getCache('user1', 'query-hash');
      expect(cached).toEqual(data);
    });

    it('should return null for missing cache', async () => {
      const cached = await storage.getCache('user1', 'nonexistent');
      expect(cached).toBeNull();
    });

    it('should return null for other users cache', async () => {
      await storage.saveCache('user1', 'query-hash', { data: 'private' });

      const cached = await storage.getCache('user2', 'query-hash');
      expect(cached).toBeNull();
    });

    it('should preserve data types in cached data', async () => {
      const data = {
        numbers: [1, 2, 3],
        string: 'test',
        nested: { deep: { value: true } },
        array: [{ id: 1 }, { id: 2 }],
      };

      await storage.saveCache('user1', 'query', data);
      const cached = await storage.getCache('user1', 'query');

      expect(cached).toEqual(data);
    });
  });

  describe('deleteCache', () => {
    it('should delete cached data', async () => {
      await storage.saveCache('user1', 'query-hash', { data: 'test' });
      await storage.deleteCache('user1', 'query-hash');

      const cached = await storage.getCache('user1', 'query-hash');
      expect(cached).toBeNull();
    });

    it('should be safe to call on non-existent cache', async () => {
      await expect(storage.deleteCache('user1', 'nonexistent')).resolves.not.toThrow();
    });

    it('should only delete user-scoped cache', async () => {
      await storage.saveCache('user1', 'query', { version: 1 });
      await storage.saveCache('user2', 'query', { version: 2 });

      await storage.deleteCache('user1', 'query');

      const deleted = await storage.getCache('user1', 'query');
      const remaining = await storage.getCache('user2', 'query');

      expect(deleted).toBeNull();
      expect(remaining).not.toBeNull();
    });
  });

  describe('CodeMapSchema validation', () => {
    it('should accept valid CodeMap', () => {
      expect(() => CodeMapSchema.parse(SAMPLE_CODEMAP)).not.toThrow();
    });

    it('should accept CodeMap with optional fields', () => {
      const codeMapWithOptionals: CodeMap = {
        version: '1.0',
        generated_at: '2024-01-01T00:00:00Z',
        source_root: '/project',
        symbols: [
          {
            qualified_name: 'module.func',
            kind: 'function',
            file: 'file.py',
            line: 10,
            column: 5,
            docstring: 'Docs',
            signature: 'func()',
            task_links: ['1.2.3'],
          },
        ],
        dependencies: [
          {
            from_sym: 'a.b',
            to_sym: 'c.d',
            kind: 'calls',
            locations: [{ file: 'a.py', line: 5 }],
          },
        ],
        schema: 'https://example.com/schema.json',
      };

      expect(() => CodeMapSchema.parse(codeMapWithOptionals)).not.toThrow();
    });

    it('should reject CodeMap with invalid version format', () => {
      const invalid = { ...SAMPLE_CODEMAP, version: 'not-a-version' };
      expect(() => CodeMapSchema.parse(invalid)).toThrow();
    });

    it('should reject CodeMap with invalid datetime', () => {
      const invalid = { ...SAMPLE_CODEMAP, generated_at: 'not-a-datetime' };
      expect(() => CodeMapSchema.parse(invalid)).toThrow();
    });

    it('should reject symbol with invalid kind', () => {
      const invalid = {
        ...SAMPLE_CODEMAP,
        symbols: [{ ...SAMPLE_CODEMAP.symbols[0], kind: 'invalid' }],
      };
      expect(() => CodeMapSchema.parse(invalid)).toThrow();
    });

    it('should reject dependency with invalid kind', () => {
      const invalid = {
        ...SAMPLE_CODEMAP,
        dependencies: [{ ...SAMPLE_CODEMAP.dependencies[0], kind: 'invalid' }],
      };
      expect(() => CodeMapSchema.parse(invalid)).toThrow();
    });

    it('should reject symbol with negative line number', () => {
      const invalid = {
        ...SAMPLE_CODEMAP,
        symbols: [{ ...SAMPLE_CODEMAP.symbols[0], line: -1 }],
      };
      expect(() => CodeMapSchema.parse(invalid)).toThrow();
    });

    it('should accept symbol with column 0', () => {
      const codeMap = {
        ...SAMPLE_CODEMAP,
        symbols: [{ ...SAMPLE_CODEMAP.symbols[0], column: 0 }],
      };
      expect(() => CodeMapSchema.parse(codeMap)).not.toThrow();
    });
  });

  describe('Multi-tenancy isolation', () => {
    it('should completely isolate user data', async () => {
      const codeMap1 = { ...SAMPLE_CODEMAP, version: '1.0' };
      const codeMap2 = { ...SAMPLE_CODEMAP, version: '2.0' };

      await storage.saveCodeMap('alice', 'shared-name', codeMap1);
      await storage.saveCodeMap('bob', 'shared-name', codeMap2);

      const aliceData = await storage.getCodeMap('alice', 'shared-name');
      const bobData = await storage.getCodeMap('bob', 'shared-name');

      expect(aliceData?.version).toBe('1.0');
      expect(bobData?.version).toBe('2.0');
    });

    it('should not allow accessing raw KV keys across users', async () => {
      await storage.saveCodeMap('user1', 'project1', SAMPLE_CODEMAP);

      // Attempt to access user1's data with user2 key - should fail
      const wrongKey = 'user:user2:project:project1';
      const stored = await mockKV.get(wrongKey);
      expect(stored).toBeNull();
    });

    it('should keep projects isolated per user on delete', async () => {
      await storage.saveCodeMap('user1', 'proj', SAMPLE_CODEMAP);
      await storage.saveCodeMap('user2', 'proj', SAMPLE_CODEMAP);
      await storage.saveCodeMap('user2', 'other', SAMPLE_CODEMAP);

      await storage.deleteCodeMap('user2', 'proj');

      const user1Project = await storage.getCodeMap('user1', 'proj');
      const user2Projects = await storage.listProjects('user2');

      expect(user1Project).not.toBeNull();
      expect(user2Projects).toEqual(['other']);
    });
  });
});
