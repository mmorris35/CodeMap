/**
 * MCP Tool: analyze_project
 * Analyzes Python source code and generates a CODE_MAP structure
 * Uses regex-based parsing to work in Cloudflare Workers environment
 */

import type { CodeMapStorage, CodeMap, Symbol, Dependency } from "../../storage";
import type { ToolCallResponse } from "../types";

/**
 * Simple Python parser for extracting symbols and dependencies
 * Uses regex patterns to find function, class, and method definitions
 */
class SimplePythonParser {
  /**
   * Parse Python source code and extract symbols and dependencies
   *
   * @param files - Mapping of file paths to source code
   * @returns Object containing symbols and dependencies arrays
   */
  parse(files: Record<string, string>): {
    symbols: Symbol[];
    dependencies: Dependency[];
  } {
    const symbols: Symbol[] = [];
    const dependencies: Dependency[] = [];
    const symbolMap = new Map<string, Symbol>();

    // First pass: extract all symbols (function, class, method definitions)
    for (const [filePath, content] of Object.entries(files)) {
      const lines = content.split("\n");

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const lineNumber = lineNum + 1;

        // Match class definitions: "class ClassName"
        const classMatch = line.match(/^class\s+(\w+)\s*(?:\(|:)/);
        if (classMatch) {
          const className = classMatch[1];
          const moduleName = this.pathToModule(filePath);
          const qualifiedName = `${moduleName}.${className}`;

          const symbol: Symbol = {
            qualified_name: qualifiedName,
            kind: "class",
            file: filePath,
            line: lineNumber,
            docstring: this.extractDocstring(lines, lineNum + 1),
          };

          symbols.push(symbol);
          symbolMap.set(qualifiedName, symbol);
        }

        // Match function/method definitions: "def function_name"
        const indent = line.match(/^(\s*)/)?.[1] || "";
        const isMethod = indent.length > 0;

        const funcMatch = line.match(/^(\s*)def\s+(\w+)\s*\(/);
        if (funcMatch) {
          const moduleName = this.pathToModule(filePath);
          const funcName = funcMatch[2];

          // Extract signature (may span multiple lines)
          let signature = "";
          let sigLine = line.substring(indent.length);
          let closeParenFound = line.includes(")");

          if (!closeParenFound) {
            // Multi-line signature
            signature = sigLine;
            for (let j = lineNum + 1; j < Math.min(lineNum + 10, lines.length); j++) {
              signature += " " + lines[j].trim();
              if (lines[j].includes(")")) {
                closeParenFound = true;
                break;
              }
            }
          } else {
            signature = sigLine;
          }

          let qualifiedName: string;

          if (isMethod) {
            // Try to find the containing class
            const containingClass = this.findContainingClass(lines, lineNum);
            if (containingClass) {
              qualifiedName = `${moduleName}.${containingClass}.${funcName}`;
            } else {
              qualifiedName = `${moduleName}.${funcName}`;
            }
          } else {
            qualifiedName = `${moduleName}.${funcName}`;
          }

          const symbol: Symbol = {
            qualified_name: qualifiedName,
            kind: isMethod ? "method" : "function",
            file: filePath,
            line: lineNumber,
            signature,
            docstring: this.extractDocstring(lines, lineNum + 1),
          };

          symbols.push(symbol);
          symbolMap.set(qualifiedName, symbol);
        }
      }

      // Add module symbol
      const moduleName = this.pathToModule(filePath);
      if (!symbolMap.has(moduleName)) {
        const moduleSymbol: Symbol = {
          qualified_name: moduleName,
          kind: "module",
          file: filePath,
          line: 1,
          docstring: this.extractDocstring(lines, 0),
        };
        symbols.push(moduleSymbol);
        symbolMap.set(moduleName, moduleSymbol);
      }
    }

    // Second pass: extract dependencies (function calls, imports, inheritance)
    for (const [filePath, content] of Object.entries(files)) {
      const lines = content.split("\n");
      const currentModule = this.pathToModule(filePath);

      // First: handle imports and inheritance (module-level)
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        // Match imports: "from module import name" and "import module"
        const fromImportMatch = line.match(/^from\s+([\w.]+)\s+import\s+([\w,\s*]+)/);
        if (fromImportMatch) {
          const importedModule = fromImportMatch[1];
          const importedNames = fromImportMatch[2].split(",").map((n) => n.trim());

          // For module-level imports, use module as source
          const fromSym = currentModule;

          for (const name of importedNames) {
            if (name === "*") continue; // Skip star imports for now

            // First try exact match
            let matchedSymbol = Array.from(symbolMap.keys()).find(
              (s) => s === `${importedModule}.${name}`,
            );

            // If not found, try to match just the module
            if (!matchedSymbol) {
              matchedSymbol = Array.from(symbolMap.keys()).find(
                (s) => s === importedModule,
              );
            }

            if (matchedSymbol) {
              dependencies.push({
                from_sym: fromSym,
                to_sym: matchedSymbol,
                kind: "imports",
                locations: [{ file: filePath, line: lineNum + 1 }],
              });
            }
          }
        }

        const importMatch = line.match(/^import\s+([\w.]+)/);
        if (importMatch) {
          const importedModule = importMatch[1];
          const matchedSymbol = Array.from(symbolMap.keys()).find(
            (s) => s === importedModule || s.endsWith(`.${importedModule}`),
          );

          if (matchedSymbol) {
            dependencies.push({
              from_sym: currentModule,
              to_sym: matchedSymbol,
              kind: "imports",
              locations: [{ file: filePath, line: lineNum + 1 }],
            });
          }
        }

        // Match class inheritance: "class Child(Parent)"
        const inheritMatch = line.match(/^class\s+(\w+)\s*\(([\w.]+(?:\s*,\s*[\w.]+)*)\)/);
        if (inheritMatch) {
          const className = inheritMatch[1];
          const parents = inheritMatch[2].split(",").map((p) => p.trim());
          const fullClassName = `${currentModule}.${className}`;

          for (const parent of parents) {
            // Try to find parent in symbols
            const matchedParent = Array.from(symbolMap.keys()).find(
              (s) =>
                s === parent ||
                s === `${currentModule}.${parent}` ||
                s.endsWith(`.${parent}`),
            );

            if (matchedParent) {
              dependencies.push({
                from_sym: fullClassName,
                to_sym: matchedParent,
                kind: "inherits",
                locations: [{ file: filePath, line: lineNum + 1 }],
              });
            }
          }
        }
      }

      // Second: handle function calls (within functions)
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        // Find the function context (which function are we in?)
        const currentFunc = this.findCurrentFunction(lines, lineNum);

        if (!currentFunc) continue;

        const fromQualifiedName = `${currentModule}.${currentFunc}`;

        // Match function calls: "something(", "module.function(", etc.
        const callMatches = line.matchAll(/(\w+(?:\.\w+)*)\s*\(/g);

        for (const match of callMatches) {
          const callTarget = match[1];

          // Skip Python builtins and keywords
          if (this.isBuiltin(callTarget)) continue;

          // Skip if it's a method call on something else (obj.method)
          // We only track direct function/module calls
          if (callTarget.includes(".")) {
            // This is a module.function or object.method call
            // Try to match it to a known symbol
            const matchedSymbol = Array.from(symbolMap.keys()).find(
              (s) => s === callTarget || s.endsWith("." + callTarget),
            );

            if (matchedSymbol) {
              dependencies.push({
                from_sym: fromQualifiedName,
                to_sym: matchedSymbol,
                kind: "calls",
                locations: [{ file: filePath, line: lineNum + 1 }],
              });
            }
          } else {
            // Simple name - look in current module first, then globally
            let resolvedTarget: string | null = null;

            // Check if it's a symbol in current module
            const inCurrentModule = Array.from(symbolMap.keys()).find(
              (s) =>
                s === `${currentModule}.${callTarget}` ||
                s === `${currentModule}.${callTarget.charAt(0).toUpperCase() + callTarget.slice(1)}`,
            );

            if (inCurrentModule) {
              resolvedTarget = inCurrentModule;
            } else {
              // Check for exact match in all symbols
              const exactMatch = Array.from(symbolMap.keys()).find(
                (s) => s.endsWith(`.${callTarget}`),
              );
              if (exactMatch) {
                resolvedTarget = exactMatch;
              }
            }

            if (resolvedTarget) {
              dependencies.push({
                from_sym: fromQualifiedName,
                to_sym: resolvedTarget,
                kind: "calls",
                locations: [{ file: filePath, line: lineNum + 1 }],
              });
            }
          }
        }
      }
    }

    return { symbols, dependencies };
  }

  /**
   * Convert file path to module name
   * Examples: "src/auth.py" -> "src.auth", "utils.py" -> "utils"
   */
  private pathToModule(filePath: string): string {
    // Remove .py extension and convert slashes to dots
    return filePath
      .replace(/\.py$/, "")
      .replace(/\//g, ".")
      .replace(/\\/g, ".");
  }

  /**
   * Extract docstring from lines starting at given index
   */
  private extractDocstring(lines: string[], startIndex: number): string | null {
    if (startIndex >= lines.length) return null;

    let index = startIndex;
    while (index < lines.length && !lines[index].trim()) {
      index++;
    }

    if (index >= lines.length) return null;

    const line = lines[index].trim();

    // Triple-quoted docstring
    if (line.startsWith('"""') || line.startsWith("'''")) {
      const quote = line.startsWith('"""') ? '"""' : "'''";

      if (line.length > 6) {
        // Single-line docstring
        const content = line.slice(3, -3).trim();
        if (content) return content;
      }

      // Multi-line docstring
      const docLines: string[] = [];
      index++;

      while (index < lines.length) {
        if (lines[index].includes(quote)) {
          const endContent = lines[index].split(quote)[0].trim();
          if (endContent) docLines.push(endContent);
          break;
        }
        docLines.push(lines[index].trim());
        index++;
      }

      return docLines.join(" ").trim() || null;
    }

    return null;
  }

  /**
   * Find the class that contains a given line (for method detection)
   */
  private findContainingClass(lines: string[], lineIndex: number): string | null {
    const lineIndent = lines[lineIndex].match(/^(\s*)/)?.[1].length || 0;

    for (let i = lineIndex - 1; i >= 0; i--) {
      const line = lines[i];
      const classMatch = line.match(/^class\s+(\w+)\s*(?:\(|:)/);

      if (classMatch) {
        const classIndent = line.match(/^(\s*)/)?.[1].length || 0;
        if (classIndent < lineIndent) {
          return classMatch[1];
        }
      }
    }

    return null;
  }

  /**
   * Find the current function at a given line
   */
  private findCurrentFunction(lines: string[], lineIndex: number): string | null {
    const lineIndent = lines[lineIndex].match(/^(\s*)/)?.[1].length || 0;

    for (let i = lineIndex; i >= 0; i--) {
      const line = lines[i];
      const funcMatch = line.match(/^(\s*)def\s+(\w+)\s*\(/);

      if (funcMatch) {
        const funcIndent = funcMatch[1].length;
        // Function must be at same or lower indentation
        if (funcIndent <= lineIndent) {
          return funcMatch[2];
        }
      }
    }

    return null;
  }

  /**
   * Check if a name is a Python builtin
   */
  private isBuiltin(name: string): boolean {
    const builtins = new Set([
      "print",
      "len",
      "range",
      "str",
      "int",
      "float",
      "list",
      "dict",
      "set",
      "tuple",
      "bool",
      "None",
      "True",
      "False",
      "type",
      "object",
      "super",
      "property",
      "staticmethod",
      "classmethod",
      "abs",
      "all",
      "any",
      "ascii",
      "bin",
      "bytes",
      "chr",
      "compile",
      "complex",
      "delattr",
      "dir",
      "divmod",
      "enumerate",
      "eval",
      "exec",
      "filter",
      "format",
      "frozenset",
      "getattr",
      "globals",
      "hasattr",
      "hash",
      "hex",
      "id",
      "input",
      "isinstance",
      "issubclass",
      "iter",
      "locals",
      "map",
      "max",
      "min",
      "next",
      "oct",
      "open",
      "ord",
      "pow",
      "repr",
      "reversed",
      "round",
      "sorted",
      "sum",
      "vars",
      "zip",
      "__import__",
      "__name__",
      "__doc__",
      "__package__",
      "__loader__",
      "__spec__",
      "__annotations__",
      "__builtins__",
    ]);

    return builtins.has(name);
  }
}

/**
 * Result structure for analyze_project tool
 */
export interface AnalyzeProjectResult {
  project_id: string;
  symbol_count: number;
  dependency_count: number;
  files_analyzed: number;
  code_map: CodeMap;
}

/**
 * Analyze Python project from source code files
 *
 * Uses regex-based parsing to extract symbols and dependencies.
 * Stores the generated CODE_MAP in KV storage for use by other tools.
 *
 * @param storage - Storage service for saving CodeMap
 * @param userId - User ID for scoped access
 * @param projectId - Project identifier
 * @param files - Mapping of file paths to Python source code
 * @returns Analysis result with CODE_MAP
 * @throws Error if no files provided or parsing fails
 */
export async function analyzeProject(
  storage: CodeMapStorage,
  userId: string,
  projectId: string,
  files: Record<string, string>,
): Promise<AnalyzeProjectResult> {
  if (!files || Object.keys(files).length === 0) {
    throw new Error("No files provided for analysis");
  }

  // Parse Python code
  const parser = new SimplePythonParser();
  const { symbols, dependencies } = parser.parse(files);

  // Create CODE_MAP structure
  const codeMap: CodeMap = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    source_root: ".",
    symbols,
    dependencies,
  };

  // Save to storage
  await storage.saveCodeMap(userId, projectId, codeMap);

  return {
    project_id: projectId,
    symbol_count: symbols.length,
    dependency_count: dependencies.length,
    files_analyzed: Object.keys(files).length,
    code_map: codeMap,
  };
}

/**
 * Handle analyze_project tool call from MCP request
 *
 * @param storage - Storage service
 * @param userId - User ID for scoped access
 * @param args - Tool arguments including project_id and files
 * @returns MCP tool response with analysis result or error
 */
export async function handleAnalyzeProject(
  storage: CodeMapStorage,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolCallResponse> {
  try {
    // Validate required arguments
    const projectId = args.project_id;
    const files = args.files;

    if (typeof projectId !== "string" || !projectId.trim()) {
      return {
        content: [
          {
            type: "text",
            text: "Error: project_id must be a non-empty string",
          },
        ],
        isError: true,
      };
    }

    if (typeof files !== "object" || files === null) {
      return {
        content: [
          {
            type: "text",
            text: "Error: files must be an object mapping file paths to source code",
          },
        ],
        isError: true,
      };
    }

    // Validate that files is a record of strings
    const filesRecord = files as Record<string, unknown>;
    for (const [path, content] of Object.entries(filesRecord)) {
      if (typeof content !== "string") {
        return {
          content: [
            {
              type: "text",
              text: `Error: file content for "${path}" must be a string`,
            },
          ],
          isError: true,
        };
      }
    }

    // Call the tool implementation
    const result = await analyzeProject(
      storage,
      userId,
      projectId,
      filesRecord as Record<string, string>,
    );

    // Format response as JSON
    const responseText = JSON.stringify(
      {
        project_id: result.project_id,
        symbol_count: result.symbol_count,
        dependency_count: result.dependency_count,
        files_analyzed: result.files_analyzed,
      },
      null,
      2,
    );

    return {
      content: [
        {
          type: "text",
          text: responseText,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
