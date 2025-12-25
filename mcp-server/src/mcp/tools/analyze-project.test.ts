/**
 * Tests for analyze_project MCP tool
 * Comprehensive tests for Python code analysis and CODE_MAP generation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { analyzeProject, handleAnalyzeProject } from "./analyze-project";
import type { CodeMapStorage } from "../../storage";

// Create mock storage
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

describe("analyzeProject tool", () => {
  let storage: CodeMapStorage;
  const userId = "test-user";
  const projectId = "test-project";

  beforeEach(() => {
    storage = createMockStorage();
  });

  describe("Simple function analysis", () => {
    it("should extract function definitions", async () => {
      const files = {
        "main.py": `def hello():
    pass

def world():
    pass`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      // Should find 2 functions + 1 module symbol
      expect(result.symbol_count).toBeGreaterThanOrEqual(2);
      const funcSymbols = result.code_map.symbols.filter((s) =>
        s.qualified_name.includes("hello") || s.qualified_name.includes("world"),
      );
      expect(funcSymbols.length).toBe(2);
    });

    it("should extract function with parameters", async () => {
      const files = {
        "auth.py": `def validate_user(username: str, password: str) -> bool:
    return True`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const validateFunc = result.code_map.symbols.find(
        (s) => s.qualified_name.includes("validate_user") && s.kind === "function",
      );
      expect(validateFunc).toBeDefined();
      expect(validateFunc?.signature).toContain("validate_user");
      expect(validateFunc?.signature).toContain("username");
      expect(validateFunc?.signature).toContain("password");
    });

    it("should extract function line numbers", async () => {
      const files = {
        "main.py": `# Comment
# Another comment
def hello():
    pass`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const helloFunc = result.code_map.symbols.find(
        (s) => s.qualified_name.includes("hello"),
      );
      expect(helloFunc?.line).toBe(3);
    });

    it("should extract docstrings", async () => {
      const files = {
        "utils.py": `def calculate():
    """Calculate something important."""
    return 42`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const calcFunc = result.code_map.symbols.find(
        (s) => s.qualified_name.includes("calculate"),
      );
      expect(calcFunc?.docstring).toContain("Calculate");
    });
  });

  describe("Class analysis", () => {
    it("should extract class definitions", async () => {
      const files = {
        "models.py": `class User:
    pass

class Product:
    pass`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const classes = result.code_map.symbols.filter((s) => s.kind === "class");
      expect(classes.length).toBeGreaterThanOrEqual(2);
    });

    it("should extract methods from classes", async () => {
      const files = {
        "auth.py": `class AuthService:
    def login(self):
        pass

    def logout(self):
        pass`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const methods = result.code_map.symbols.filter(
        (s) => s.kind === "method" && s.qualified_name.includes("AuthService"),
      );
      expect(methods.length).toBeGreaterThanOrEqual(2);
    });

    it("should track class inheritance", async () => {
      const files = {
        "models.py": `class BaseModel:
    pass

class User(BaseModel):
    pass`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const inheritDeps = result.code_map.dependencies.filter(
        (d) => d.kind === "inherits",
      );
      expect(inheritDeps.length).toBeGreaterThan(0);
      expect(inheritDeps[0].from_sym).toContain("User");
      expect(inheritDeps[0].to_sym).toContain("BaseModel");
    });

    it("should handle multiple inheritance", async () => {
      const files = {
        "models.py": `class Mixin1:
    pass

class Mixin2:
    pass

class Combined(Mixin1, Mixin2):
    pass`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const inheritDeps = result.code_map.dependencies.filter(
        (d) => d.kind === "inherits" && d.from_sym.includes("Combined"),
      );
      expect(inheritDeps.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Function call tracking", () => {
    it("should track function calls", async () => {
      const files = {
        "main.py": `def helper():
    pass

def main():
    helper()`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const callDeps = result.code_map.dependencies.filter(
        (d) => d.kind === "calls",
      );
      expect(callDeps.length).toBeGreaterThan(0);
      expect(callDeps.some((d) => d.to_sym.includes("helper"))).toBe(true);
    });

    it("should track cross-module calls", async () => {
      const files = {
        "utils.py": `def calculate():
    return 42`,
        "main.py": `from utils import calculate

def run():
    result = calculate()`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const callDeps = result.code_map.dependencies.filter(
        (d) => d.kind === "calls" && d.to_sym.includes("calculate"),
      );
      expect(callDeps.length).toBeGreaterThan(0);
    });

    it("should track method calls within classes", async () => {
      const files = {
        "service.py": `class Service:
    def helper(self):
        pass

    def process(self):
        self.helper()`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      expect(result.code_map.dependencies.length).toBeGreaterThan(0);
    });

    it("should skip builtin function calls", async () => {
      const files = {
        "main.py": `def process():
    items = [1, 2, 3]
    length = len(items)
    text = str(length)
    return text`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      // Should not have dependencies on len or str
      const builtinDeps = result.code_map.dependencies.filter((d) =>
        d.to_sym.includes("len") || d.to_sym.includes("str"),
      );
      expect(builtinDeps.length).toBe(0);
    });
  });

  describe("Import tracking", () => {
    it("should track from-import statements", async () => {
      const files = {
        "utils.py": `def helper():
    pass`,
        "main.py": `from utils import helper

def run():
    helper()`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const importDeps = result.code_map.dependencies.filter(
        (d) => d.kind === "imports",
      );
      expect(importDeps.length).toBeGreaterThan(0);
    });

    it("should track simple import statements", async () => {
      const files = {
        "config.py": `DEBUG = True`,
        "main.py": `import config

print(config.DEBUG)`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const importDeps = result.code_map.dependencies.filter(
        (d) => d.kind === "imports" && d.to_sym.includes("config"),
      );
      expect(importDeps.length).toBeGreaterThan(0);
    });
  });

  describe("Module structure", () => {
    it("should create module symbols", async () => {
      const files = {
        "main.py": `# Main module`,
        "utils.py": `# Utils module`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const modules = result.code_map.symbols.filter((s) => s.kind === "module");
      expect(modules.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle nested module paths", async () => {
      const files = {
        "src/auth/validate.py": `def check_token():
    pass`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const symbol = result.code_map.symbols.find(
        (s) => s.kind === "function" && s.qualified_name.includes("check_token"),
      );
      expect(symbol?.file).toBe("src/auth/validate.py");
    });

    it("should handle backslash paths (Windows)", async () => {
      const files = {
        "src\\auth\\validate.py": `def check_token():
    pass`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const symbol = result.code_map.symbols.find(
        (s) => s.kind === "function" && s.qualified_name.includes("check_token"),
      );
      expect(symbol).toBeDefined();
    });
  });

  describe("Result structure", () => {
    it("should return AnalyzeProjectResult with correct fields", async () => {
      const files = {
        "main.py": `def hello(): pass`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      expect(result).toHaveProperty("project_id");
      expect(result).toHaveProperty("symbol_count");
      expect(result).toHaveProperty("dependency_count");
      expect(result).toHaveProperty("files_analyzed");
      expect(result).toHaveProperty("code_map");
    });

    it("should count files analyzed correctly", async () => {
      const files = {
        "main.py": `def hello(): pass`,
        "utils.py": `def helper(): pass`,
        "config.py": `DEBUG = True`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      expect(result.files_analyzed).toBe(3);
    });

    it("should count symbols correctly", async () => {
      const files = {
        "main.py": `def func1(): pass
def func2(): pass`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      expect(result.symbol_count).toBeGreaterThanOrEqual(2);
    });

    it("should create valid CODE_MAP structure", async () => {
      const files = {
        "main.py": `def hello(): pass`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const codeMap = result.code_map;
      expect(codeMap.version).toBe("1.0");
      expect(codeMap.generated_at).toBeDefined();
      expect(Array.isArray(codeMap.symbols)).toBe(true);
      expect(Array.isArray(codeMap.dependencies)).toBe(true);
      expect(codeMap.source_root).toBe(".");
    });

    it("should save CODE_MAP to storage", async () => {
      const files = {
        "main.py": `def hello(): pass`,
      };

      await analyzeProject(storage, userId, projectId, files);

      expect(vi.mocked(storage.saveCodeMap)).toHaveBeenCalledWith(
        userId,
        projectId,
        expect.objectContaining({
          version: "1.0",
          symbols: expect.any(Array),
          dependencies: expect.any(Array),
        }),
      );
    });
  });

  describe("Error handling", () => {
    it("should throw error if no files provided", async () => {
      await expect(analyzeProject(storage, userId, projectId, {})).rejects.toThrow(
        "No files provided",
      );
    });

    it("should throw error if files is null", async () => {
      await expect(
        analyzeProject(storage, userId, projectId, null as any),
      ).rejects.toThrow();
    });

    it("should throw error if files is undefined", async () => {
      await expect(
        analyzeProject(storage, userId, projectId, undefined as any),
      ).rejects.toThrow();
    });
  });

  describe("Edge cases", () => {
    it("should handle empty file content", async () => {
      const files = {
        "main.py": "",
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      expect(result.code_map.symbols.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle files with only comments", async () => {
      const files = {
        "main.py": `# This is a comment
# Another comment
# Yet another comment`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      expect(result.code_map.symbols.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle indented code", async () => {
      const files = {
        "main.py": `if True:
    def nested():
        pass`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const nestedFunc = result.code_map.symbols.find(
        (s) => s.qualified_name.includes("nested"),
      );
      expect(nestedFunc).toBeDefined();
    });

    it("should handle complex method signatures", async () => {
      const files = {
        "main.py": `def complex_func(
    arg1: str,
    arg2: int = 0,
    *args,
    **kwargs
) -> bool:
    pass`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const complexFunc = result.code_map.symbols.find(
        (s) => s.qualified_name.includes("complex_func"),
      );
      expect(complexFunc?.signature).toBeDefined();
    });

    it("should handle decorators", async () => {
      const files = {
        "main.py": `@property
def name(self):
    return self._name

@staticmethod
def static_method():
    pass`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      const name = result.code_map.symbols.find(
        (s) => s.qualified_name.includes("name"),
      );
      const staticMethod = result.code_map.symbols.find(
        (s) => s.qualified_name.includes("static_method"),
      );

      expect(name).toBeDefined();
      expect(staticMethod).toBeDefined();
    });
  });

  describe("Real-world scenarios", () => {
    it("should analyze a complete auth module", async () => {
      const files = {
        "auth.py": `import jwt

class TokenError(Exception):
    pass

def encode_token(payload):
    """Encode JWT token."""
    return jwt.encode(payload, "secret")

def decode_token(token):
    """Decode JWT token."""
    try:
        return jwt.decode(token, "secret")
    except jwt.InvalidTokenError:
        raise TokenError("Invalid token")`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      expect(result.symbol_count).toBeGreaterThan(0);
      expect(result.dependency_count).toBeGreaterThan(0);

      const symbols = result.code_map.symbols;
      expect(symbols.some((s) => s.qualified_name.includes("TokenError"))).toBe(true);
      expect(
        symbols.some((s) => s.qualified_name.includes("encode_token")),
      ).toBe(true);
      expect(
        symbols.some((s) => s.qualified_name.includes("decode_token")),
      ).toBe(true);
    });

    it("should handle multi-file project", async () => {
      const files = {
        "models.py": `class User:
    def __init__(self, name):
        self.name = name

class Product:
    def __init__(self, name):
        self.name = name`,
        "services.py": `from models import User, Product

class UserService:
    def get_user(self, user_id):
        return User(f"User {user_id}")`,
        "api.py": `from services import UserService

service = UserService()

def get_user_endpoint(user_id):
    return service.get_user(user_id)`,
      };

      const result = await analyzeProject(storage, userId, projectId, files);

      expect(result.files_analyzed).toBe(3);
      expect(result.symbol_count).toBeGreaterThan(5);
      expect(result.code_map.dependencies.length).toBeGreaterThan(0);
    });
  });
});

describe("handleAnalyzeProject (MCP handler)", () => {
  let storage: CodeMapStorage;
  const userId = "test-user";

  beforeEach(() => {
    storage = createMockStorage();
  });

  describe("Valid arguments", () => {
    it("should return successful response for valid arguments", async () => {
      const args = {
        project_id: "test-project",
        files: {
          "main.py": "def hello(): pass",
        },
      };

      const response = await handleAnalyzeProject(storage, userId, args);

      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0].type).toBe("text");
      expect(response.isError).not.toBe(true);
    });

    it("should include analysis summary in response", async () => {
      const args = {
        project_id: "test-project",
        files: {
          "main.py": "def hello(): pass",
          "utils.py": "def helper(): pass",
        },
      };

      const response = await handleAnalyzeProject(storage, userId, args);

      const responseText = response.content[0].text || "";
      const parsed = JSON.parse(responseText);

      expect(parsed).toHaveProperty("project_id");
      expect(parsed).toHaveProperty("symbol_count");
      expect(parsed).toHaveProperty("dependency_count");
      expect(parsed).toHaveProperty("files_analyzed");
      expect(parsed.files_analyzed).toBe(2);
    });

    it("should save code map to storage", async () => {
      const args = {
        project_id: "my-project",
        files: {
          "main.py": "def test(): pass",
        },
      };

      await handleAnalyzeProject(storage, userId, args);

      expect(vi.mocked(storage.saveCodeMap)).toHaveBeenCalled();
    });
  });

  describe("Invalid arguments", () => {
    it("should return error for missing project_id", async () => {
      const args = {
        files: {
          "main.py": "def hello(): pass",
        },
      };

      const response = await handleAnalyzeProject(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("project_id");
    });

    it("should return error for empty project_id", async () => {
      const args = {
        project_id: "",
        files: {
          "main.py": "def hello(): pass",
        },
      };

      const response = await handleAnalyzeProject(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("project_id");
    });

    it("should return error for non-string project_id", async () => {
      const args = {
        project_id: 123,
        files: {
          "main.py": "def hello(): pass",
        },
      };

      const response = await handleAnalyzeProject(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("project_id");
    });

    it("should return error for missing files", async () => {
      const args = {
        project_id: "test-project",
      };

      const response = await handleAnalyzeProject(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("files");
    });

    it("should return error for non-object files", async () => {
      const args = {
        project_id: "test-project",
        files: "not an object",
      };

      const response = await handleAnalyzeProject(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("files");
    });

    it("should return error for null files", async () => {
      const args = {
        project_id: "test-project",
        files: null,
      };

      const response = await handleAnalyzeProject(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("files");
    });

    it("should return error for non-string file content", async () => {
      const args = {
        project_id: "test-project",
        files: {
          "main.py": 123,
        },
      };

      const response = await handleAnalyzeProject(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("main.py");
    });

    it("should return error for mixed file content types", async () => {
      const args = {
        project_id: "test-project",
        files: {
          "main.py": "def hello(): pass",
          "utils.py": 456,
        },
      };

      const response = await handleAnalyzeProject(storage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("utils.py");
    });
  });

  describe("Error handling", () => {
    it("should catch and format errors", async () => {
      const errorStorage = createMockStorage();
      vi.mocked(errorStorage.saveCodeMap).mockRejectedValueOnce(
        new Error("Storage error"),
      );

      const args = {
        project_id: "test-project",
        files: {
          "main.py": "def hello(): pass",
        },
      };

      const response = await handleAnalyzeProject(errorStorage, userId, args);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("Error");
    });
  });

  describe("Response format", () => {
    it("should return ToolCallResponse with content array", async () => {
      const args = {
        project_id: "test-project",
        files: {
          "main.py": "def hello(): pass",
        },
      };

      const response = await handleAnalyzeProject(storage, userId, args);

      expect(response).toHaveProperty("content");
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content.length).toBeGreaterThan(0);
    });

    it("should have text type content", async () => {
      const args = {
        project_id: "test-project",
        files: {
          "main.py": "def hello(): pass",
        },
      };

      const response = await handleAnalyzeProject(storage, userId, args);

      expect(response.content[0].type).toBe("text");
      expect(response.content[0].text).toBeDefined();
    });

    it("should not set isError for success", async () => {
      const args = {
        project_id: "test-project",
        files: {
          "main.py": "def hello(): pass",
        },
      };

      const response = await handleAnalyzeProject(storage, userId, args);

      expect(response.isError).not.toBe(true);
    });
  });
});
