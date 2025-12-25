/**
 * Tests for MCP tool implementations
 */

import { describe, it, expect } from 'vitest';
import {
  getDependents,
  getImpactReport,
  checkBreakingChange,
  getArchitecture,
} from './tools.js';
import type { CodeMap } from './types.js';

// Sample CodeMap for testing
function createSampleCodeMap(): CodeMap {
  return {
    version: '1.0',
    generated_at: new Date().toISOString(),
    source_root: '/test',
    symbols: [
      { qualified_name: 'main.run', kind: 'function', file: 'main.py', line: 5, docstring: null, signature: 'def run()' },
      { qualified_name: 'auth.validate', kind: 'function', file: 'auth.py', line: 10, docstring: null, signature: 'def validate(user, password)' },
      { qualified_name: 'auth.hash', kind: 'function', file: 'auth.py', line: 20, docstring: null, signature: 'def hash(data)' },
      { qualified_name: 'db.connect', kind: 'function', file: 'db.py', line: 1, docstring: null, signature: 'def connect(url)' },
      { qualified_name: 'db.query', kind: 'function', file: 'db.py', line: 10, docstring: null, signature: 'def query(sql)' },
      { qualified_name: 'utils.helper', kind: 'function', file: 'utils.py', line: 1, docstring: null, signature: 'def helper()' },
    ],
    dependencies: [
      { from_sym: 'main.run', to_sym: 'auth.validate', kind: 'calls' },
      { from_sym: 'auth.validate', to_sym: 'auth.hash', kind: 'calls' },
      { from_sym: 'auth.validate', to_sym: 'db.query', kind: 'calls' },
      { from_sym: 'db.query', to_sym: 'db.connect', kind: 'calls' },
    ],
  };
}

describe('getDependents', () => {
  it('should find direct dependents', () => {
    const codeMap = createSampleCodeMap();
    const result = getDependents(codeMap, 'auth.hash');

    expect(result.symbol).toBe('auth.hash');
    expect(result.direct.length).toBe(1);
    expect(result.direct[0].symbol).toBe('auth.validate');
  });

  it('should find transitive dependents', () => {
    const codeMap = createSampleCodeMap();
    const result = getDependents(codeMap, 'db.connect');

    // db.connect <- db.query <- auth.validate <- main.run
    expect(result.direct.length).toBe(1);
    expect(result.transitive.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(1);
  });

  it('should return empty for symbol with no dependents', () => {
    const codeMap = createSampleCodeMap();
    const result = getDependents(codeMap, 'main.run');

    expect(result.direct.length).toBe(0);
    expect(result.transitive.length).toBe(0);
    expect(result.total).toBe(0);
  });

  it('should include file and line info', () => {
    const codeMap = createSampleCodeMap();
    const result = getDependents(codeMap, 'auth.hash');

    expect(result.direct[0].file).toBe('auth.py');
    expect(result.direct[0].line).toBe(10);
  });

  it('should respect maxDepth', () => {
    const codeMap = createSampleCodeMap();

    const unlimited = getDependents(codeMap, 'db.connect', 0);
    const depth1 = getDependents(codeMap, 'db.connect', 1);

    expect(depth1.transitive.length).toBe(0); // Only direct
    expect(unlimited.total).toBeGreaterThan(depth1.total);
  });

  it('should handle non-existent symbol', () => {
    const codeMap = createSampleCodeMap();
    const result = getDependents(codeMap, 'nonexistent.func');

    expect(result.direct.length).toBe(0);
    expect(result.transitive.length).toBe(0);
  });
});

describe('getImpactReport', () => {
  it('should calculate risk score', () => {
    const codeMap = createSampleCodeMap();
    const result = getImpactReport(codeMap, 'auth.hash');

    expect(result.symbol).toBe('auth.hash');
    expect(result.risk_score).toBeGreaterThanOrEqual(0);
    expect(result.risk_score).toBeLessThanOrEqual(100);
  });

  it('should determine risk level', () => {
    const codeMap = createSampleCodeMap();
    const result = getImpactReport(codeMap, 'auth.hash');

    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.risk_level);
  });

  it('should collect affected files', () => {
    const codeMap = createSampleCodeMap();
    const result = getImpactReport(codeMap, 'db.connect');

    expect(result.affected_files.length).toBeGreaterThan(0);
  });

  it('should suggest test files', () => {
    const codeMap = createSampleCodeMap();
    const result = getImpactReport(codeMap, 'auth.hash', true);

    expect(result.suggested_tests.length).toBeGreaterThan(0);
  });

  it('should skip tests when includeTests is false', () => {
    const codeMap = createSampleCodeMap();
    const result = getImpactReport(codeMap, 'auth.hash', false);

    expect(result.suggested_tests.length).toBe(0);
  });

  it('should generate summary', () => {
    const codeMap = createSampleCodeMap();
    const result = getImpactReport(codeMap, 'auth.hash');

    expect(result.summary).toBeDefined();
    expect(result.summary).toContain('auth.hash');
  });

  it('should have low risk for isolated functions', () => {
    const codeMap = createSampleCodeMap();
    const result = getImpactReport(codeMap, 'utils.helper');

    expect(result.risk_level).toBe('LOW');
  });

  it('should include direct and transitive dependents', () => {
    const codeMap = createSampleCodeMap();
    const result = getImpactReport(codeMap, 'db.connect');

    expect(Array.isArray(result.direct_dependents)).toBe(true);
    expect(Array.isArray(result.transitive_dependents)).toBe(true);
  });
});

describe('checkBreakingChange', () => {
  it('should detect adding required parameter as breaking', () => {
    const codeMap = createSampleCodeMap();
    const result = checkBreakingChange(
      codeMap,
      'auth.validate',
      'def validate(user, password, token)'
    );

    expect(result.is_breaking).toBe(true);
    expect(result.reason).toContain('required');
  });

  it('should detect removed parameter as breaking', () => {
    const codeMap = createSampleCodeMap();
    const result = checkBreakingChange(
      codeMap,
      'auth.validate',
      'def validate(user)'
    );

    expect(result.is_breaking).toBe(true);
    expect(result.reason).toContain('removed');
  });

  it('should allow adding optional parameter', () => {
    const codeMap = createSampleCodeMap();
    const result = checkBreakingChange(
      codeMap,
      'auth.validate',
      'def validate(user, password, debug=False)'
    );

    expect(result.is_breaking).toBe(false);
  });

  it('should list breaking callers', () => {
    const codeMap = createSampleCodeMap();
    const result = checkBreakingChange(
      codeMap,
      'auth.validate',
      'def validate(user, password, token)'
    );

    expect(result.breaking_callers.length).toBeGreaterThan(0);
    expect(result.breaking_callers).toContain('main.run');
  });

  it('should list safe callers for non-breaking changes', () => {
    const codeMap = createSampleCodeMap();
    const result = checkBreakingChange(
      codeMap,
      'auth.validate',
      'def validate(user, password, debug=False)'
    );

    expect(result.safe_callers.length).toBeGreaterThan(0);
  });

  it('should include old and new signatures', () => {
    const codeMap = createSampleCodeMap();
    const result = checkBreakingChange(
      codeMap,
      'auth.validate',
      'def validate(user)'
    );

    expect(result.old_signature).toBe('def validate(user, password)');
    expect(result.new_signature).toBe('def validate(user)');
  });

  it('should provide suggestion', () => {
    const codeMap = createSampleCodeMap();
    const result = checkBreakingChange(
      codeMap,
      'auth.validate',
      'def validate(user, password, token)'
    );

    expect(result.suggestion).toBeDefined();
    expect(result.suggestion.length).toBeGreaterThan(0);
  });

  it('should handle function with no callers', () => {
    const codeMap = createSampleCodeMap();
    const result = checkBreakingChange(
      codeMap,
      'utils.helper',
      'def helper(x)'
    );

    expect(result.breaking_callers.length).toBe(0);
  });
});

describe('getArchitecture', () => {
  it('should return module info', () => {
    const codeMap = createSampleCodeMap();
    const result = getArchitecture(codeMap, 'module');

    expect(result.modules.length).toBeGreaterThan(0);
  });

  it('should count symbols per module', () => {
    const codeMap = createSampleCodeMap();
    const result = getArchitecture(codeMap, 'module');

    const authModule = result.modules.find((m) => m.name.includes('auth'));
    expect(authModule?.symbols).toBeGreaterThanOrEqual(2); // validate and hash
  });

  it('should track dependencies between modules', () => {
    const codeMap = createSampleCodeMap();
    const result = getArchitecture(codeMap, 'module');

    expect(result.dependencies.length).toBeGreaterThan(0);
  });

  it('should identify hotspots', () => {
    // Create a codeMap with a hotspot
    const codeMap: CodeMap = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      source_root: '/test',
      symbols: [
        { qualified_name: 'core.util', kind: 'function', file: 'core.py', line: 1, docstring: null },
        { qualified_name: 'a.func', kind: 'function', file: 'a.py', line: 1, docstring: null },
        { qualified_name: 'b.func', kind: 'function', file: 'b.py', line: 1, docstring: null },
        { qualified_name: 'c.func', kind: 'function', file: 'c.py', line: 1, docstring: null },
        { qualified_name: 'd.func', kind: 'function', file: 'd.py', line: 1, docstring: null },
      ],
      dependencies: [
        { from_sym: 'a.func', to_sym: 'core.util', kind: 'calls' },
        { from_sym: 'b.func', to_sym: 'core.util', kind: 'calls' },
        { from_sym: 'c.func', to_sym: 'core.util', kind: 'calls' },
        { from_sym: 'd.func', to_sym: 'core.util', kind: 'calls' },
      ],
    };

    const result = getArchitecture(codeMap, 'module');

    expect(result.hotspots.length).toBeGreaterThan(0);
  });

  it('should generate summary', () => {
    const codeMap = createSampleCodeMap();
    const result = getArchitecture(codeMap, 'module');

    expect(result.summary).toBeDefined();
    expect(result.summary).toContain('modules');
  });

  it('should support package level', () => {
    const codeMap: CodeMap = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      source_root: '/test',
      symbols: [
        { qualified_name: 'src.auth.validate', kind: 'function', file: 'src/auth/validate.py', line: 1, docstring: null },
        { qualified_name: 'src.db.connect', kind: 'function', file: 'src/db/connect.py', line: 1, docstring: null },
      ],
      dependencies: [],
    };

    const result = getArchitecture(codeMap, 'package');

    expect(result.level).toBe('package');
    // Should group by package (src/auth, src/db)
    expect(result.modules.length).toBeGreaterThanOrEqual(2);
  });

  it('should return empty cycles array', () => {
    const codeMap = createSampleCodeMap();
    const result = getArchitecture(codeMap, 'module');

    expect(Array.isArray(result.cycles)).toBe(true);
  });
});

describe('edge cases', () => {
  it('should handle empty CodeMap', () => {
    const codeMap: CodeMap = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      source_root: '/test',
      symbols: [],
      dependencies: [],
    };

    const dependents = getDependents(codeMap, 'any.symbol');
    expect(dependents.total).toBe(0);

    const impact = getImpactReport(codeMap, 'any.symbol');
    expect(impact.risk_level).toBe('LOW');

    const breaking = checkBreakingChange(codeMap, 'any.symbol', 'def any()');
    expect(breaking.is_breaking).toBe(false);

    const arch = getArchitecture(codeMap, 'module');
    expect(arch.modules.length).toBe(0);
  });

  it('should handle circular dependencies without infinite loop', () => {
    const codeMap: CodeMap = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      source_root: '/test',
      symbols: [
        { qualified_name: 'a.func', kind: 'function', file: 'a.py', line: 1, docstring: null },
        { qualified_name: 'b.func', kind: 'function', file: 'b.py', line: 1, docstring: null },
      ],
      dependencies: [
        { from_sym: 'a.func', to_sym: 'b.func', kind: 'calls' },
        { from_sym: 'b.func', to_sym: 'a.func', kind: 'calls' },
      ],
    };

    // Should not hang
    const result = getDependents(codeMap, 'a.func');
    expect(result.total).toBeGreaterThan(0);
  });
});
