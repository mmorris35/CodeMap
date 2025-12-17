/**
 * Tests for get_impact_report MCP tool
 * Comprehensive tests for impact analysis functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getImpactReport, handleGetImpactReport, getRiskLevel } from './get-impact-report';
import type { CodeMapStorage, CodeMap } from '../../storage';
import * as getDependentsModule from './get-dependents';

// Mock CodeMap data for testing
const mockCodeMap: CodeMap = {
  version: '1.0',
  generated_at: '2024-12-17T00:00:00Z',
  source_root: '/app',
  symbols: [
    {
      qualified_name: 'auth.validate_token',
      kind: 'function',
      file: 'src/auth.ts',
      line: 10,
      docstring: 'Validate JWT token',
    },
    {
      qualified_name: 'auth.decode_jwt',
      kind: 'function',
      file: 'src/auth.ts',
      line: 20,
      docstring: 'Decode JWT',
    },
    {
      qualified_name: 'api.login',
      kind: 'function',
      file: 'src/api.ts',
      line: 30,
      docstring: 'Login endpoint',
    },
    {
      qualified_name: 'api.protected',
      kind: 'function',
      file: 'src/api.ts',
      line: 40,
      docstring: 'Protected endpoint',
    },
    {
      qualified_name: 'middleware.check_auth',
      kind: 'function',
      file: 'src/middleware.ts',
      line: 50,
      docstring: 'Check authentication',
    },
    {
      qualified_name: 'services.user_service',
      kind: 'class',
      file: 'src/services.ts',
      line: 60,
      docstring: 'User service',
    },
    {
      qualified_name: 'test.auth_test',
      kind: 'function',
      file: 'test/test_auth.ts',
      line: 100,
      docstring: 'Test auth module',
    },
    {
      qualified_name: 'test.api_test',
      kind: 'function',
      file: 'test/api.test.ts',
      line: 120,
      docstring: 'Test api module',
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

describe('getImpactReport tool', () => {
  let storage: CodeMapStorage;
  const userId = 'test-user';
  const projectId = 'test-project';

  beforeEach(() => {
    storage = createMockStorage();
    // Mock getDependents to return fixed results
    vi.spyOn(getDependentsModule, 'getDependents').mockResolvedValue({
      symbol: 'auth.validate_token',
      direct: [
        { symbol: 'api.login', file: 'src/api.ts', line: 30 },
        { symbol: 'api.protected', file: 'src/api.ts', line: 40 },
        { symbol: 'middleware.check_auth', file: 'src/middleware.ts', line: 50 },
      ],
      transitive: [
        { symbol: 'services.user_service', file: 'src/services.ts', line: 60 },
      ],
      total: 4,
    });
  });

  describe('Risk score calculation', () => {
    it('should calculate risk score with formula: (direct * 10) + (transitive * 3) + (files * 5)', async () => {
      // direct=3, transitive=1, files=3
      // score = (3 * 10) + (1 * 3) + (3 * 5) = 30 + 3 + 15 = 48
      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(report.risk_score).toBe(48);
    });

    it('should cap risk score at 100', async () => {
      // Override mock to return many dependents
      vi.spyOn(getDependentsModule, 'getDependents').mockResolvedValue({
        symbol: 'auth.validate_token',
        direct: Array(20).fill(0).map((_, i) => ({
          symbol: `caller_${i}`,
          file: `src/file_${i % 5}.ts`,
          line: 10 + i,
        })),
        transitive: Array(50).fill(0).map((_, i) => ({
          symbol: `transitive_${i}`,
          file: `src/file_${i % 8}.ts`,
          line: 100 + i,
        })),
        total: 70,
      });

      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(report.risk_score).toBeLessThanOrEqual(100);
    });
  });

  describe('Risk level determination', () => {
    it('should return LOW risk level for score < 25', async () => {
      vi.spyOn(getDependentsModule, 'getDependents').mockResolvedValue({
        symbol: 'auth.validate_token',
        direct: [{ symbol: 'api.login', file: 'src/api.ts', line: 30 }],
        transitive: [],
        total: 1,
      });

      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(report.risk_level).toBe('LOW');
    });

    it('should return MEDIUM risk level for score 25-49', async () => {
      vi.spyOn(getDependentsModule, 'getDependents').mockResolvedValue({
        symbol: 'auth.validate_token',
        direct: [
          { symbol: 'api.login', file: 'src/api.ts', line: 30 },
          { symbol: 'api.protected', file: 'src/api.ts', line: 40 },
        ],
        transitive: [{ symbol: 'services.user_service', file: 'src/services.ts', line: 60 }],
        total: 3,
      });

      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(report.risk_level).toBe('MEDIUM');
    });

    it('should return HIGH risk level for score 50-74', async () => {
      // Score calculation: (6 direct * 10) + (2 transitive * 3) + (3 files * 5) = 60 + 6 + 15 = 81
      // Need score between 50-74, so try: (5 * 10) + (1 * 3) + (2 * 5) = 50 + 3 + 10 = 63
      vi.spyOn(getDependentsModule, 'getDependents').mockResolvedValue({
        symbol: 'auth.validate_token',
        direct: Array(5).fill(0).map((_, i) => ({
          symbol: `caller_${i}`,
          file: `src/file_${i % 2}.ts`,
          line: 10 + i,
        })),
        transitive: Array(1).fill(0).map((_, i) => ({
          symbol: `transitive_${i}`,
          file: `src/file_${2 + i}.ts`,
          line: 100 + i,
        })),
        total: 6,
      });

      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(report.risk_level).toBe('HIGH');
    });

    it('should return CRITICAL risk level for score >= 75', async () => {
      vi.spyOn(getDependentsModule, 'getDependents').mockResolvedValue({
        symbol: 'auth.validate_token',
        direct: Array(10).fill(0).map((_, i) => ({
          symbol: `caller_${i}`,
          file: `src/file_${i % 5}.ts`,
          line: 10 + i,
        })),
        transitive: Array(10).fill(0).map((_, i) => ({
          symbol: `transitive_${i}`,
          file: `src/file_${(5 + i) % 8}.ts`,
          line: 100 + i,
        })),
        total: 20,
      });

      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(report.risk_level).toBe('CRITICAL');
    });
  });

  describe('Affected files extraction', () => {
    it('should extract unique files from dependents', async () => {
      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(report.affected_files).toContain('src/api.ts');
      expect(report.affected_files).toContain('src/middleware.ts');
      expect(report.affected_files).toContain('src/services.ts');
      expect(report.affected_files.length).toBe(3);
    });

    it('should return sorted affected files', async () => {
      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      const sorted = [...report.affected_files].sort();
      expect(report.affected_files).toEqual(sorted);
    });
  });

  describe('File summary', () => {
    it('should create file summary with counts', async () => {
      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(report.file_summary['src/api.ts']).toBe(2); // api.login, api.protected
      expect(report.file_summary['src/middleware.ts']).toBe(1); // middleware.check_auth
      expect(report.file_summary['src/services.ts']).toBe(1); // services.user_service
    });
  });

  describe('Test file suggestions', () => {
    it('should suggest test files matching affected modules', async () => {
      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token',
        true // includeTests = true
      );

      // Should suggest api.test.ts because api.ts is in affected files
      expect(report.suggested_tests).toContain('test/api.test.ts');
    });

    it('should not suggest tests when includeTests is false', async () => {
      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token',
        false // includeTests = false
      );

      expect(report.suggested_tests).toHaveLength(0);
    });

    it('should return sorted test file paths', async () => {
      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token',
        true
      );

      const sorted = [...report.suggested_tests].sort();
      expect(report.suggested_tests).toEqual(sorted);
    });
  });

  describe('Summary generation', () => {
    it('should generate human-readable summary', async () => {
      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(report.summary).toContain('auth.validate_token');
      expect(report.summary).toContain('MEDIUM');
      expect(report.summary).toContain('4 function(s)');
      expect(report.summary).toContain('3 file(s)');
    });

    it('should include direct and transitive counts in summary', async () => {
      vi.spyOn(getDependentsModule, 'getDependents').mockResolvedValue({
        symbol: 'auth.validate_token',
        direct: [
          { symbol: 'api.login', file: 'src/api.ts', line: 30 },
        ],
        transitive: [
          { symbol: 'services.user_service', file: 'src/services.ts', line: 60 },
        ],
        total: 2,
      });

      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(report.summary).toContain('2 function(s)');
      expect(report.summary).toContain('1 direct');
      expect(report.summary).toContain('1 transitive');
    });
  });

  describe('Error handling', () => {
    it('should throw error if project not found', async () => {
      const emptyStorage = {
        saveCodeMap: vi.fn(),
        getCodeMap: vi.fn().mockResolvedValue(null),
        deleteCodeMap: vi.fn(),
        listProjects: vi.fn(),
        saveCache: vi.fn(),
        getCache: vi.fn(),
        deleteCache: vi.fn(),
      } as unknown as CodeMapStorage;

      await expect(
        getImpactReport(emptyStorage, userId, projectId, 'auth.validate_token')
      ).rejects.toThrow('Project not found');
    });

    it('should throw error if symbol not found', async () => {
      vi.spyOn(getDependentsModule, 'getDependents').mockRejectedValue(
        new Error('Symbol not found: nonexistent.symbol')
      );

      await expect(
        getImpactReport(storage, userId, projectId, 'nonexistent.symbol')
      ).rejects.toThrow('Symbol not found');
    });
  });

  describe('Direct and transitive dependents', () => {
    it('should include direct dependents in report', async () => {
      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(report.direct_dependents).toHaveLength(3);
      expect(report.direct_dependents[0].symbol).toBe('api.login');
    });

    it('should include transitive dependents in report', async () => {
      const report = await getImpactReport(
        storage,
        userId,
        projectId,
        'auth.validate_token'
      );

      expect(report.transitive_dependents).toHaveLength(1);
      expect(report.transitive_dependents[0].symbol).toBe('services.user_service');
    });
  });
});

describe('handleGetImpactReport handler', () => {
  let storage: CodeMapStorage;
  const userId = 'test-user';

  beforeEach(() => {
    storage = createMockStorage();
    vi.spyOn(getDependentsModule, 'getDependents').mockResolvedValue({
      symbol: 'auth.validate_token',
      direct: [
        { symbol: 'api.login', file: 'src/api.ts', line: 30 },
      ],
      transitive: [],
      total: 1,
    });
  });

  describe('Argument validation', () => {
    it('should require project_id', async () => {
      const response = await handleGetImpactReport(storage, userId, {
        symbol: 'auth.validate_token',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].type).toBe('text');
      expect(response.content[0].text).toContain('project_id');
    });

    it('should require non-empty project_id', async () => {
      const response = await handleGetImpactReport(storage, userId, {
        project_id: '',
        symbol: 'auth.validate_token',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('project_id');
    });

    it('should require symbol', async () => {
      const response = await handleGetImpactReport(storage, userId, {
        project_id: 'test-project',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('symbol');
    });

    it('should require non-empty symbol', async () => {
      const response = await handleGetImpactReport(storage, userId, {
        project_id: 'test-project',
        symbol: '',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('symbol');
    });

    it('should validate include_tests is boolean', async () => {
      const response = await handleGetImpactReport(storage, userId, {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
        include_tests: 'yes',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('boolean');
    });

    it('should accept valid arguments', async () => {
      const response = await handleGetImpactReport(storage, userId, {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
      });

      expect(response.isError).toBeFalsy();
      expect(response.content[0].type).toBe('text');
    });

    it('should accept include_tests argument', async () => {
      const response = await handleGetImpactReport(storage, userId, {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
        include_tests: false,
      });

      expect(response.isError).toBeFalsy();
    });
  });

  describe('Response formatting', () => {
    it('should return JSON formatted response', async () => {
      const response = await handleGetImpactReport(storage, userId, {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
      });

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');

      const text = response.content[0].text || '';
      const result = JSON.parse(text);

      expect(result.symbol).toBe('auth.validate_token');
      expect(result.risk_score).toBeDefined();
      expect(result.risk_level).toBeDefined();
      expect(result.direct_dependents).toBeDefined();
      expect(result.transitive_dependents).toBeDefined();
    });

    it('should include proper indentation in JSON response', async () => {
      const response = await handleGetImpactReport(storage, userId, {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
      });

      const text = response.content[0].text || '';
      expect(text).toContain('  '); // Should have indentation
    });
  });

  describe('Error handling', () => {
    it('should handle errors gracefully', async () => {
      vi.spyOn(getDependentsModule, 'getDependents').mockRejectedValue(
        new Error('Symbol not found')
      );

      const response = await handleGetImpactReport(storage, userId, {
        project_id: 'test-project',
        symbol: 'nonexistent',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Error:');
    });

    it('should handle non-Error exceptions', async () => {
      vi.spyOn(getDependentsModule, 'getDependents').mockRejectedValue('Unknown error');

      const response = await handleGetImpactReport(storage, userId, {
        project_id: 'test-project',
        symbol: 'auth.validate_token',
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Error:');
    });
  });
});

describe('Risk level helper', () => {
  it('should have getRiskLevel exported for testing', () => {
    expect(getRiskLevel).toBeDefined();
  });
});
