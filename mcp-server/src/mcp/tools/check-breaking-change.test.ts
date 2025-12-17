/**
 * Tests for check_breaking_change MCP tool
 * Comprehensive tests for signature analysis and breaking change detection
 */

import { describe, it, expect, vi } from 'vitest';
import {
  checkBreakingChange,
  handleCheckBreakingChange,
} from './check-breaking-change';
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
      file: 'auth.ts',
      line: 10,
      signature: '(token: string) => boolean',
      docstring: 'Validate JWT token',
    },
    {
      qualified_name: 'auth.decode_jwt',
      kind: 'function',
      file: 'auth.ts',
      line: 20,
      signature: '(token: string, secret?: string) => object',
      docstring: 'Decode JWT',
    },
    {
      qualified_name: 'auth.hash_password',
      kind: 'function',
      file: 'auth.ts',
      line: 30,
      // No signature - testing null case
      docstring: 'Hash password',
    },
    {
      qualified_name: 'api.login',
      kind: 'function',
      file: 'api.ts',
      line: 40,
      signature: '(username: string, password: string) => object',
      docstring: 'Login endpoint',
    },
    {
      qualified_name: 'api.protected',
      kind: 'function',
      file: 'api.ts',
      line: 50,
      signature: '(token: string) => object',
      docstring: 'Protected endpoint',
    },
    {
      qualified_name: 'middleware.check_auth',
      kind: 'function',
      file: 'middleware.ts',
      line: 60,
      signature: '(req: Request) => void',
      docstring: 'Check authentication',
    },
  ],
  dependencies: [
    // api.login calls auth.validate_token
    {
      from_sym: 'api.login',
      to_sym: 'auth.validate_token',
      kind: 'calls',
    },
    // api.protected calls auth.validate_token
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
  ],
};

// Create mock storage
const createMockStorage = (codeMapData?: CodeMap): CodeMapStorage => {
  const data = codeMapData || mockCodeMap;
  return {
    saveCodeMap: vi.fn(),
    getCodeMap: vi.fn().mockResolvedValue(data),
    deleteCodeMap: vi.fn(),
    listProjects: vi.fn(),
    saveCache: vi.fn(),
    getCache: vi.fn(),
    deleteCache: vi.fn(),
  } as unknown as CodeMapStorage;
};

describe('checkBreakingChange', () => {
  describe('parameter parsing and analysis', () => {
    it('detects adding required parameters as breaking', async () => {
      const storage = createMockStorage();
      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '(token: string, realm: string) => boolean' // Added required param
      );

      expect(result.is_breaking).toBe(true);
      expect(result.reason).toContain('required parameter');
      expect(result.breaking_callers).toContain('api.login');
      expect(result.breaking_callers).toContain('api.protected');
      expect(result.breaking_callers).toContain('middleware.check_auth');
    });

    it('detects removing parameters as breaking', async () => {
      const storage = createMockStorage();
      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.decode_jwt',
        '(secret?: string) => object' // Removed 'token' parameter
      );

      expect(result.is_breaking).toBe(true);
      expect(result.reason).toContain('Required parameter');
      expect(result.breaking_callers.length).toBeGreaterThan(0);
    });

    it('detects parameter order changes as breaking', async () => {
      const storage = createMockStorage();
      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'api.login',
        '(password: string, username: string) => object' // Swapped order
      );

      expect(result.is_breaking).toBe(true);
      expect(result.reason).toContain('Parameter order');
    });

    it('detects type changes as breaking', async () => {
      const storage = createMockStorage();
      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '(token: number) => boolean' // Changed type from string to number
      );

      expect(result.is_breaking).toBe(true);
      expect(result.reason).toContain('Type change');
    });

    it('allows adding optional parameters at end (safe)', async () => {
      const storage = createMockStorage();
      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '(token: string, realm?: string) => boolean' // Added optional param
      );

      expect(result.is_breaking).toBe(false);
      expect(result.reason).toBeNull();
      expect(result.safe_callers).toContain('api.login');
      expect(result.breaking_callers).toHaveLength(0);
    });

    it('allows return type changes only (safe)', async () => {
      const storage = createMockStorage();
      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '(token: string) => string' // Changed return type only
      );

      expect(result.is_breaking).toBe(false);
      expect(result.safe_callers).toContain('api.login');
    });
  });

  describe('missing signatures', () => {
    it('handles missing old signature (new symbol)', async () => {
      const storage = createMockStorage();
      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.hash_password',
        '(password: string, salt?: string) => string'
      );

      expect(result.old_signature).toBeNull();
      expect(result.is_breaking).toBe(false);
      expect(result.reason).toBeNull();
      expect(result.safe_callers).toHaveLength(0);
    });

    it('handles empty old signature string', async () => {
      const storage = createMockStorage({
        ...mockCodeMap,
        symbols: mockCodeMap.symbols.map((s) =>
          s.qualified_name === 'auth.validate_token'
            ? { ...s, signature: '' }
            : s
        ),
      });

      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '(token: string, realm: string) => boolean'
      );

      expect(result.old_signature).toBe('');
      expect(result.is_breaking).toBe(false); // Treated like new signature
    });
  });

  describe('caller identification', () => {
    it('identifies all direct and transitive callers as breaking', async () => {
      const storage = createMockStorage();
      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '(token: string, realm: string) => boolean' // Breaking change
      );

      expect(result.is_breaking).toBe(true);
      expect(result.breaking_callers).toEqual(
        expect.arrayContaining(['api.login', 'api.protected', 'middleware.check_auth'])
      );
      expect(result.safe_callers).toHaveLength(0);
    });

    it('identifies all callers as safe for backward-compatible change', async () => {
      const storage = createMockStorage();
      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '(token: string, options?: object) => boolean' // Safe change
      );

      expect(result.is_breaking).toBe(false);
      expect(result.safe_callers).toEqual(
        expect.arrayContaining(['api.login', 'api.protected', 'middleware.check_auth'])
      );
      expect(result.breaking_callers).toHaveLength(0);
    });

    it('handles symbols with no callers', async () => {
      const storage = createMockStorage();
      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.hash_password', // No callers in test data
        '(password: string, salt: string) => string' // Breaking
      );

      expect(result.is_breaking).toBe(false); // No old signature
      expect(result.breaking_callers).toHaveLength(0);
      expect(result.safe_callers).toHaveLength(0);
    });
  });

  describe('result fields', () => {
    it('includes old signature in result', async () => {
      const storage = createMockStorage();
      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '(token: string) => string'
      );

      expect(result.old_signature).toBe('(token: string) => boolean');
      expect(result.symbol).toBe('auth.validate_token');
    });

    it('generates helpful suggestion for breaking change', async () => {
      const storage = createMockStorage();
      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '(token: string, realm: string) => boolean'
      );

      expect(result.suggestion).toContain('Update');
      expect(result.suggestion).toContain('caller');
    });

    it('generates helpful suggestion for safe change', async () => {
      const storage = createMockStorage();
      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '(token: string, realm?: string) => boolean'
      );

      expect(result.suggestion).toContain('backward compatible');
    });

    it('suggestion mentions count of affected callers', async () => {
      const storage = createMockStorage();
      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '(token: string, realm: string) => boolean'
      );

      expect(result.suggestion).toContain('3 caller');
    });
  });

  describe('error handling', () => {
    it('throws error for non-existent project', async () => {
      const storage = {
        getCodeMap: vi.fn().mockResolvedValue(null),
      } as unknown as CodeMapStorage;

      await expect(
        checkBreakingChange(
          storage,
          'user123',
          'non-existent',
          'auth.validate_token',
          '(token: string) => boolean'
        )
      ).rejects.toThrow('Project not found');
    });

    it('throws error for non-existent symbol', async () => {
      const storage = createMockStorage();

      await expect(
        checkBreakingChange(
          storage,
          'user123',
          'test-project',
          'non.existent.symbol',
          '(token: string) => boolean'
        )
      ).rejects.toThrow('Symbol not found');
    });
  });

  describe('signature parsing edge cases', () => {
    it('handles signatures with no parameters', async () => {
      const storage = createMockStorage({
        ...mockCodeMap,
        symbols: mockCodeMap.symbols.map((s) =>
          s.qualified_name === 'auth.validate_token'
            ? { ...s, signature: '() => boolean' }
            : s
        ),
      });

      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '(token: string) => boolean' // Adding a required param
      );

      expect(result.is_breaking).toBe(true);
      expect(result.reason).toContain('New required parameter');
    });

    it('handles signatures with complex types', async () => {
      const storage = createMockStorage({
        ...mockCodeMap,
        symbols: mockCodeMap.symbols.map((s) =>
          s.qualified_name === 'auth.validate_token'
            ? { ...s, signature: '(token: string | null) => boolean' }
            : s
        ),
      });

      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '(token: string) => boolean' // Type changed
      );

      expect(result.is_breaking).toBe(true);
    });

    it('handles Python-style signatures', async () => {
      const storage = createMockStorage({
        ...mockCodeMap,
        symbols: mockCodeMap.symbols.map((s) =>
          s.qualified_name === 'auth.validate_token'
            ? { ...s, signature: 'def validate_token(token: str) -> bool:' }
            : s
        ),
      });

      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        'def validate_token(token: str, realm: str) -> bool:' // Added required
      );

      expect(result.is_breaking).toBe(true);
    });

    it('handles signatures with *args and **kwargs', async () => {
      const storage = createMockStorage({
        ...mockCodeMap,
        symbols: mockCodeMap.symbols.map((s) =>
          s.qualified_name === 'auth.validate_token'
            ? { ...s, signature: '(token: string, *args, **kwargs)' }
            : s
        ),
      });

      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '(token: string, realm: string, *args, **kwargs)' // Added required
      );

      expect(result.is_breaking).toBe(true);
    });

    it('handles signatures with generic types', async () => {
      const storage = createMockStorage({
        ...mockCodeMap,
        symbols: mockCodeMap.symbols.map((s) =>
          s.qualified_name === 'auth.validate_token'
            ? { ...s, signature: '<T>(token: T) => boolean' }
            : s
        ),
      });

      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '<T>(token: T, realm?: string) => boolean' // Added optional
      );

      expect(result.is_breaking).toBe(false);
    });

    it('handles empty parameter string', async () => {
      const storage = createMockStorage();

      const result = await checkBreakingChange(
        storage,
        'user123',
        'test-project',
        'auth.validate_token',
        '() => boolean' // Removed all params
      );

      expect(result.is_breaking).toBe(true);
    });
  });
});

describe('handleCheckBreakingChange', () => {
  describe('argument validation', () => {
    it('returns error for missing project_id', async () => {
      const storage = createMockStorage();
      const response = await handleCheckBreakingChange(storage, 'user123', {
        symbol: 'auth.validate_token',
        new_signature: '(token: string) => boolean',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('project_id');
    });

    it('returns error for empty project_id', async () => {
      const storage = createMockStorage();
      const response = await handleCheckBreakingChange(storage, 'user123', {
        project_id: '   ',
        symbol: 'auth.validate_token',
        new_signature: '(token: string) => boolean',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('project_id');
    });

    it('returns error for missing symbol', async () => {
      const storage = createMockStorage();
      const response = await handleCheckBreakingChange(storage, 'user123', {
        project_id: 'test-project',
        new_signature: '(token: string) => boolean',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('symbol');
    });

    it('returns error for empty symbol', async () => {
      const storage = createMockStorage();
      const response = await handleCheckBreakingChange(storage, 'user123', {
        project_id: 'test-project',
        symbol: '',
        new_signature: '(token: string) => boolean',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('symbol');
    });

    it('returns error for missing new_signature', async () => {
      const storage = createMockStorage();
      const response = await handleCheckBreakingChange(storage, 'user123', {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('new_signature');
    });

    it('returns error for empty new_signature', async () => {
      const storage = createMockStorage();
      const response = await handleCheckBreakingChange(storage, 'user123', {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
        new_signature: '   ',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('new_signature');
    });

    it('returns error for non-string arguments', async () => {
      const storage = createMockStorage();
      const response = await handleCheckBreakingChange(storage, 'user123', {
        project_id: 123,
        symbol: 'auth.validate_token',
        new_signature: '(token: string) => boolean',
      });

      expect(response.isError).toBe(true);
    });
  });

  describe('successful tool call', () => {
    it('returns breaking change result as JSON', async () => {
      const storage = createMockStorage();
      const response = await handleCheckBreakingChange(storage, 'user123', {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
        new_signature: '(token: string, realm: string) => boolean',
      });

      expect(response.isError).toBeFalsy();
      expect(response.content[0].type).toBe('text');
      expect(typeof response.content[0].text).toBe('string');

      const result = JSON.parse(response.content[0].text!);
      expect(result.symbol).toBe('auth.validate_token');
      expect(result.is_breaking).toBe(true);
      expect(result.breaking_callers).toBeDefined();
    });

    it('returns safe change result as JSON', async () => {
      const storage = createMockStorage();
      const response = await handleCheckBreakingChange(storage, 'user123', {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
        new_signature: '(token: string, realm?: string) => boolean',
      });

      expect(response.isError).toBeFalsy();
      const result = JSON.parse(response.content[0].text!);
      expect(result.is_breaking).toBe(false);
    });
  });

  describe('error handling', () => {
    it('returns error response for project not found', async () => {
      const storage = {
        getCodeMap: vi.fn().mockResolvedValue(null),
      } as unknown as CodeMapStorage;

      const response = await handleCheckBreakingChange(storage, 'user123', {
        project_id: 'non-existent',
        symbol: 'auth.validate_token',
        new_signature: '(token: string) => boolean',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Project not found');
    });

    it('returns error response for symbol not found', async () => {
      const storage = createMockStorage();

      const response = await handleCheckBreakingChange(storage, 'user123', {
        project_id: 'test-project',
        symbol: 'non.existent.symbol',
        new_signature: '(token: string) => boolean',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Symbol not found');
    });
  });
});
