"""Custom AST visitor for metadata extraction."""

from __future__ import annotations

import ast
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from codemap.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class FunctionInfo:
    """Information about a function."""

    name: str
    qualname: str
    lineno: int
    is_async: bool
    docstring: Optional[str] = None
    signature: Optional[str] = None
    decorators: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        """Initialize decorators list."""
        pass


@dataclass
class ClassInfo:
    """Information about a class."""

    name: str
    lineno: int
    bases: list[str] = field(default_factory=list)
    methods: list[str] = field(default_factory=list)
    docstring: Optional[str] = None

    def __post_init__(self) -> None:
        """Initialize bases and methods lists."""
        pass


class CodeMapVisitor(ast.NodeVisitor):
    """Custom AST visitor for extracting metadata."""

    def __init__(self, file_path: Path) -> None:
        """Initialize visitor.

        Args:
            file_path: Path to the Python file being analyzed.
        """
        self.file_path = file_path
        self.functions: list[FunctionInfo] = []
        self.classes: list[ClassInfo] = []
        self.imports: list[tuple[str, Optional[str]]] = []
        self.call_sites: list[tuple[str, int]] = []
        self._current_class: Optional[str] = None

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:  # noqa: N802
        """Visit function definition."""
        self._process_function(node, is_async=False)
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:  # noqa: N802
        """Visit async function definition."""
        self._process_function(node, is_async=True)
        self.generic_visit(node)

    def _process_function(
        self,
        node: ast.FunctionDef | ast.AsyncFunctionDef,
        is_async: bool,
    ) -> None:
        """Process a function node.

        Args:
            node: AST function node.
            is_async: Whether it's an async function.
        """
        # Build qualified name
        qualname = node.name
        if self._current_class:
            qualname = f"{self._current_class}.{node.name}"

        # Get docstring
        docstring = ast.get_docstring(node)

        # Get decorators
        decorators = [self._node_to_str(dec) for dec in node.decorator_list]

        func_info = FunctionInfo(
            name=node.name,
            qualname=qualname,
            lineno=node.lineno,
            is_async=is_async,
            docstring=docstring,
            decorators=decorators,
        )
        self.functions.append(func_info)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:  # noqa: N802
        """Visit class definition."""
        docstring = ast.get_docstring(node)
        bases = [self._node_to_str(base) for base in node.bases]

        class_info = ClassInfo(
            name=node.name,
            lineno=node.lineno,
            bases=bases,
            docstring=docstring,
        )

        # Extract methods
        for item in node.body:
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                class_info.methods.append(item.name)

        self.classes.append(class_info)

        # Visit class body with updated context
        old_class = self._current_class
        self._current_class = node.name
        self.generic_visit(node)
        self._current_class = old_class

    def visit_Import(self, node: ast.Import) -> None:  # noqa: N802
        """Visit import statement."""
        for alias in node.names:
            name = alias.asname if alias.asname else alias.name
            self.imports.append((alias.name, name))
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:  # noqa: N802
        """Visit from...import statement."""
        module = node.module or ""
        for alias in node.names:
            name = alias.asname if alias.asname else alias.name
            full_name = f"{module}.{alias.name}" if module else alias.name
            self.imports.append((full_name, name))
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        """Visit function call."""
        if isinstance(node.func, ast.Name):
            self.call_sites.append((node.func.id, node.lineno))
        elif isinstance(node.func, ast.Attribute):
            obj_name = self._node_to_str(node.func.value)
            self.call_sites.append((f"{obj_name}.{node.func.attr}", node.lineno))

        self.generic_visit(node)

    @staticmethod
    def _node_to_str(node: ast.expr) -> str:
        """Convert AST node to string.

        Args:
            node: AST expression node.

        Returns:
            String representation of the node.
        """
        return ast.unparse(node)


def analyze_file(file_path: Path) -> dict[str, Any]:
    """Analyze a Python file and extract metadata.

    Args:
        file_path: Path to Python file.

    Returns:
        Dictionary with functions, classes, imports, and calls.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            source = f.read()
        tree = ast.parse(source)
    except SyntaxError as error:
        logger.error("Syntax error in %s: %s", file_path, error)
        return {
            "functions": [],
            "classes": [],
            "imports": [],
            "calls": [],
        }

    visitor = CodeMapVisitor(file_path)
    visitor.visit(tree)

    return {
        "functions": visitor.functions,
        "classes": visitor.classes,
        "imports": visitor.imports,
        "calls": visitor.call_sites,
    }
