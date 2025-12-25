/**
 * Tests for Python code analyzer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  analyzeProject,
  saveCodeMap,
  loadCodeMap,
  listProjects,
  getStorageDir,
} from './analyzer.js';

describe('analyzeProject', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should extract function definitions', async () => {
    const pythonFile = path.join(tempDir, 'main.py');
    fs.writeFileSync(
      pythonFile,
      `def hello():
    pass

def world():
    pass
`
    );

    const result = await analyzeProject(tempDir);

    expect(result.symbols.length).toBeGreaterThanOrEqual(2);
    const funcSymbols = result.symbols.filter(
      (s) => s.kind === 'function' && (s.qualified_name.includes('hello') || s.qualified_name.includes('world'))
    );
    expect(funcSymbols.length).toBe(2);
  });

  it('should extract class definitions', async () => {
    const pythonFile = path.join(tempDir, 'models.py');
    fs.writeFileSync(
      pythonFile,
      `class User:
    pass

class Product:
    pass
`
    );

    const result = await analyzeProject(tempDir);

    const classes = result.symbols.filter((s) => s.kind === 'class');
    expect(classes.length).toBeGreaterThanOrEqual(2);
  });

  it('should extract methods from classes', async () => {
    const pythonFile = path.join(tempDir, 'service.py');
    fs.writeFileSync(
      pythonFile,
      `class AuthService:
    def login(self):
        pass

    def logout(self):
        pass
`
    );

    const result = await analyzeProject(tempDir);

    const methods = result.symbols.filter(
      (s) => s.kind === 'method' && s.qualified_name.includes('AuthService')
    );
    expect(methods.length).toBeGreaterThanOrEqual(2);
  });

  it('should extract docstrings', async () => {
    const pythonFile = path.join(tempDir, 'utils.py');
    fs.writeFileSync(
      pythonFile,
      `def calculate():
    """Calculate something important."""
    return 42
`
    );

    const result = await analyzeProject(tempDir);

    const calcFunc = result.symbols.find((s) => s.qualified_name.includes('calculate'));
    expect(calcFunc?.docstring).toContain('Calculate');
  });

  it('should extract function signatures', async () => {
    const pythonFile = path.join(tempDir, 'auth.py');
    fs.writeFileSync(
      pythonFile,
      `def validate_user(username: str, password: str) -> bool:
    return True
`
    );

    const result = await analyzeProject(tempDir);

    const validateFunc = result.symbols.find((s) => s.qualified_name.includes('validate_user'));
    expect(validateFunc?.signature).toContain('username');
    expect(validateFunc?.signature).toContain('password');
  });

  it('should track line numbers', async () => {
    const pythonFile = path.join(tempDir, 'main.py');
    fs.writeFileSync(
      pythonFile,
      `# Comment
# Another comment
def hello():
    pass
`
    );

    const result = await analyzeProject(tempDir);

    const helloFunc = result.symbols.find(
      (s) => s.kind === 'function' && s.qualified_name.includes('hello')
    );
    expect(helloFunc?.line).toBe(3);
  });

  it('should track function calls as dependencies', async () => {
    const pythonFile = path.join(tempDir, 'main.py');
    fs.writeFileSync(
      pythonFile,
      `def helper():
    pass

def main():
    helper()
`
    );

    const result = await analyzeProject(tempDir);

    const callDeps = result.dependencies.filter((d) => d.kind === 'calls');
    expect(callDeps.length).toBeGreaterThan(0);
    expect(callDeps.some((d) => d.to_sym.includes('helper'))).toBe(true);
  });

  it('should handle nested directories', async () => {
    const subDir = path.join(tempDir, 'src', 'auth');
    fs.mkdirSync(subDir, { recursive: true });

    const pythonFile = path.join(subDir, 'validate.py');
    fs.writeFileSync(
      pythonFile,
      `def check_token():
    pass
`
    );

    const result = await analyzeProject(tempDir);

    const symbol = result.symbols.find(
      (s) => s.kind === 'function' && s.qualified_name.includes('check_token')
    );
    expect(symbol).toBeDefined();
    expect(symbol?.file).toContain('src');
  });

  it('should exclude patterns', async () => {
    const venvDir = path.join(tempDir, 'venv', 'lib');
    fs.mkdirSync(venvDir, { recursive: true });

    fs.writeFileSync(path.join(tempDir, 'main.py'), 'def main(): pass');
    fs.writeFileSync(path.join(venvDir, 'package.py'), 'def internal(): pass');

    const result = await analyzeProject(tempDir);

    // Should not include venv files
    const venvSymbols = result.symbols.filter((s) => s.file.includes('venv'));
    expect(venvSymbols.length).toBe(0);
  });

  it('should create valid CodeMap structure', async () => {
    fs.writeFileSync(path.join(tempDir, 'main.py'), 'def hello(): pass');

    const result = await analyzeProject(tempDir);

    expect(result.version).toBe('1.0');
    expect(result.generated_at).toBeDefined();
    expect(result.source_root).toBeDefined();
    expect(Array.isArray(result.symbols)).toBe(true);
    expect(Array.isArray(result.dependencies)).toBe(true);
  });

  it('should handle empty directory', async () => {
    const result = await analyzeProject(tempDir);

    expect(result.symbols.length).toBe(0);
    expect(result.dependencies.length).toBe(0);
  });

  it('should handle multiple files', async () => {
    fs.writeFileSync(path.join(tempDir, 'main.py'), 'def main(): pass');
    fs.writeFileSync(path.join(tempDir, 'utils.py'), 'def helper(): pass');
    fs.writeFileSync(path.join(tempDir, 'config.py'), 'DEBUG = True');

    const result = await analyzeProject(tempDir);

    // Should have symbols from all files
    expect(result.symbols.length).toBeGreaterThanOrEqual(3); // At least 2 functions + modules
  });
});

describe('saveCodeMap and loadCodeMap', () => {
  let originalHome: string | undefined;
  let tempHome: string;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-home-'));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('should save and load CODE_MAP', () => {
    const codeMap = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      source_root: '/test',
      symbols: [
        {
          qualified_name: 'main.hello',
          kind: 'function' as const,
          file: 'main.py',
          line: 1,
          docstring: null,
        },
      ],
      dependencies: [],
    };

    saveCodeMap('test-project', codeMap);
    const loaded = loadCodeMap('test-project');

    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe('1.0');
    expect(loaded?.symbols.length).toBe(1);
  });

  it('should return null for non-existent project', () => {
    const result = loadCodeMap('non-existent-project');
    expect(result).toBeNull();
  });

  it('should create storage directory if not exists', () => {
    const storageDir = getStorageDir();
    expect(fs.existsSync(storageDir)).toBe(false);

    saveCodeMap('test', {
      version: '1.0',
      generated_at: new Date().toISOString(),
      source_root: '/test',
      symbols: [],
      dependencies: [],
    });

    expect(fs.existsSync(storageDir)).toBe(true);
  });
});

describe('listProjects', () => {
  let originalHome: string | undefined;
  let tempHome: string;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-home-'));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('should return empty list when no projects', () => {
    const projects = listProjects();
    expect(projects).toEqual([]);
  });

  it('should list saved projects', () => {
    const codeMap = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      source_root: '/test',
      symbols: [],
      dependencies: [],
    };

    saveCodeMap('project-a', codeMap);
    saveCodeMap('project-b', codeMap);

    const projects = listProjects();
    expect(projects).toContain('project-a');
    expect(projects).toContain('project-b');
    expect(projects.length).toBe(2);
  });
});

describe('getStorageDir', () => {
  it('should return path in home directory', () => {
    const storageDir = getStorageDir();
    expect(storageDir).toContain('.codemap');
  });
});
