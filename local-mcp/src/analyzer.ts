/**
 * Python code analyzer using tree-sitter
 * Extracts symbols (functions, classes, methods) and their dependencies
 */

import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type { CodeMap, Symbol, Dependency } from './types.js';

const parser = new Parser();
parser.setLanguage(Python as unknown as Parser.Language);

interface ParsedSymbol {
  name: string;
  qualified_name: string;
  kind: 'module' | 'class' | 'function' | 'method';
  file: string;
  line: number;
  docstring: string | null;
  signature?: string;
  parent?: string;
}

interface ParsedCall {
  from_symbol: string;
  to_name: string;
  file: string;
  line: number;
}

/**
 * Extract the docstring from a function/class definition
 */
function extractDocstring(node: Parser.SyntaxNode): string | null {
  const body = node.childForFieldName('body');
  if (!body) return null;

  const firstChild = body.firstChild;
  if (firstChild?.type === 'expression_statement') {
    const expr = firstChild.firstChild;
    if (expr?.type === 'string') {
      // Remove quotes and clean up
      let doc = expr.text;
      if (doc.startsWith('"""') || doc.startsWith("'''")) {
        doc = doc.slice(3, -3);
      } else if (doc.startsWith('"') || doc.startsWith("'")) {
        doc = doc.slice(1, -1);
      }
      return doc.trim();
    }
  }
  return null;
}

/**
 * Extract function signature from parameters
 */
function extractSignature(node: Parser.SyntaxNode, name: string): string {
  const params = node.childForFieldName('parameters');
  if (!params) return `def ${name}()`;

  return `def ${name}${params.text}`;
}

/**
 * Parse a Python file and extract symbols and calls
 */
function parseFile(
  filePath: string,
  sourceRoot: string
): { symbols: ParsedSymbol[]; calls: ParsedCall[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const tree = parser.parse(content);

  const relativePath = path.relative(sourceRoot, filePath);
  const moduleName = relativePath
    .replace(/\.py$/, '')
    .replace(/\//g, '.')
    .replace(/__init__$/, '')
    .replace(/\.$/, '');

  const symbols: ParsedSymbol[] = [];
  const calls: ParsedCall[] = [];

  // Add module symbol
  symbols.push({
    name: path.basename(filePath, '.py'),
    qualified_name: moduleName || path.basename(filePath, '.py'),
    kind: 'module',
    file: relativePath,
    line: 1,
    docstring: null,
  });

  // Track current scope for qualified names
  function traverse(
    node: Parser.SyntaxNode,
    scope: string[] = [],
    currentClass?: string
  ): void {
    if (node.type === 'function_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const name = nameNode.text;
        const isMethod = currentClass !== undefined;
        const qualifiedName = [...scope, name].join('.');

        symbols.push({
          name,
          qualified_name: moduleName ? `${moduleName}.${qualifiedName}` : qualifiedName,
          kind: isMethod ? 'method' : 'function',
          file: relativePath,
          line: node.startPosition.row + 1,
          docstring: extractDocstring(node),
          signature: extractSignature(node, name),
          parent: currentClass,
        });

        // Traverse function body for calls
        const body = node.childForFieldName('body');
        if (body) {
          traverseForCalls(body, moduleName ? `${moduleName}.${qualifiedName}` : qualifiedName);
        }
      }
    } else if (node.type === 'class_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const name = nameNode.text;
        const qualifiedName = [...scope, name].join('.');

        symbols.push({
          name,
          qualified_name: moduleName ? `${moduleName}.${qualifiedName}` : qualifiedName,
          kind: 'class',
          file: relativePath,
          line: node.startPosition.row + 1,
          docstring: extractDocstring(node),
        });

        // Traverse class body with class context
        const body = node.childForFieldName('body');
        if (body) {
          for (const child of body.children) {
            traverse(child, [...scope, name], name);
          }
        }
        return; // Don't traverse children again
      }
    }

    // Traverse children
    for (const child of node.children) {
      traverse(child, scope, currentClass);
    }
  }

  function traverseForCalls(node: Parser.SyntaxNode, fromSymbol: string): void {
    if (node.type === 'call') {
      const funcNode = node.childForFieldName('function');
      if (funcNode) {
        let callName = '';
        if (funcNode.type === 'identifier') {
          callName = funcNode.text;
        } else if (funcNode.type === 'attribute') {
          callName = funcNode.text;
        }

        if (callName && !callName.startsWith('self.')) {
          calls.push({
            from_symbol: fromSymbol,
            to_name: callName,
            file: relativePath,
            line: node.startPosition.row + 1,
          });
        }
      }
    }

    for (const child of node.children) {
      traverseForCalls(child, fromSymbol);
    }
  }

  traverse(tree.rootNode);

  return { symbols, calls };
}

/**
 * Resolve call targets to qualified symbol names
 */
function resolveCalls(
  calls: ParsedCall[],
  symbolMap: Map<string, ParsedSymbol>
): Dependency[] {
  const dependencies: Dependency[] = [];
  const seen = new Set<string>();

  for (const call of calls) {
    // Try to find the target symbol
    let targetSymbol: string | null = null;

    // Try exact match first
    for (const [qualName] of symbolMap) {
      if (qualName.endsWith(`.${call.to_name}`) || qualName === call.to_name) {
        targetSymbol = qualName;
        break;
      }
    }

    if (targetSymbol) {
      const key = `${call.from_symbol}->${targetSymbol}`;
      if (!seen.has(key)) {
        seen.add(key);
        dependencies.push({
          from_sym: call.from_symbol,
          to_sym: targetSymbol,
          kind: 'calls',
        });
      }
    }
  }

  return dependencies;
}

/**
 * Analyze a Python project and generate CODE_MAP
 */
export async function analyzeProject(
  sourceRoot: string,
  excludePatterns: string[] = ['**/node_modules/**', '**/__pycache__/**', '**/venv/**', '**/.venv/**']
): Promise<CodeMap> {
  const absoluteRoot = path.resolve(sourceRoot);

  // Find all Python files
  const files = await glob('**/*.py', {
    cwd: absoluteRoot,
    ignore: excludePatterns,
    absolute: true,
  });

  const allSymbols: ParsedSymbol[] = [];
  const allCalls: ParsedCall[] = [];

  // Parse each file
  for (const file of files) {
    try {
      const { symbols, calls } = parseFile(file, absoluteRoot);
      allSymbols.push(...symbols);
      allCalls.push(...calls);
    } catch (error) {
      console.error(`Error parsing ${file}:`, error);
    }
  }

  // Build symbol map for resolution
  const symbolMap = new Map<string, ParsedSymbol>();
  for (const sym of allSymbols) {
    symbolMap.set(sym.qualified_name, sym);
  }

  // Resolve calls to dependencies
  const dependencies = resolveCalls(allCalls, symbolMap);

  // Convert to CodeMap format
  const symbols: Symbol[] = allSymbols.map((s) => ({
    qualified_name: s.qualified_name,
    kind: s.kind,
    file: s.file,
    line: s.line,
    docstring: s.docstring,
    signature: s.signature,
  }));

  return {
    version: '1.0',
    generated_at: new Date().toISOString(),
    source_root: absoluteRoot,
    symbols,
    dependencies,
  };
}

/**
 * Get storage directory for CODE_MAP files
 */
export function getStorageDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.codemap');
}

/**
 * Save CODE_MAP to local storage
 */
export function saveCodeMap(projectId: string, codeMap: CodeMap): void {
  const storageDir = getStorageDir();
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const filePath = path.join(storageDir, `${projectId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(codeMap, null, 2));
}

/**
 * Load CODE_MAP from local storage
 */
export function loadCodeMap(projectId: string): CodeMap | null {
  const filePath = path.join(getStorageDir(), `${projectId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as CodeMap;
}

/**
 * List all stored projects
 */
export function listProjects(): string[] {
  const storageDir = getStorageDir();
  if (!fs.existsSync(storageDir)) {
    return [];
  }

  return fs.readdirSync(storageDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''));
}
