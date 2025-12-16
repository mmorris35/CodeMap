"""JSON schemas for CodeMap output files."""

from __future__ import annotations

from typing import Any, TypedDict

from codemap.logging_config import get_logger

logger = get_logger(__name__)


class SymbolEntry(TypedDict, total=False):
    """Schema for a symbol entry in CODE_MAP.json."""

    qualified_name: str
    kind: str
    file: str
    line: int
    column: int
    docstring: str
    signature: str
    task_links: list[str]


class LocationEntry(TypedDict, total=False):
    """Schema for a location entry in dependency."""

    file: str
    line: int


class DependencyEntry(TypedDict, total=False):
    """Schema for a dependency entry in CODE_MAP.json."""

    from_sym: str
    to_sym: str
    kind: str
    locations: list[LocationEntry]


class CodeMapSchema(TypedDict, total=False):
    """Schema for the complete CODE_MAP.json structure."""

    schema: str
    version: str
    generated_at: str
    source_root: str
    symbols: list[SymbolEntry]
    dependencies: list[DependencyEntry]


def validate_code_map(data: Any) -> tuple[bool, str]:
    """Validate a data structure against CodeMapSchema.

    Performs basic structural validation to ensure required fields exist.

    Args:
        data: Data structure to validate.

    Returns:
        Tuple of (is_valid, error_message).
    """
    if not isinstance(data, dict):
        return False, "Code map must be a dictionary"

    # Check required fields
    required_fields = {"version", "generated_at", "source_root", "symbols", "dependencies"}
    missing = required_fields - set(data.keys())
    if missing:
        return False, f"Missing required fields: {missing}"

    # Validate symbols
    if not isinstance(data.get("symbols"), list):
        return False, "symbols must be a list"

    for symbol in data["symbols"]:
        if not isinstance(symbol, dict):
            return False, "Each symbol must be a dictionary"
        if "qualified_name" not in symbol or "kind" not in symbol:
            return False, "Each symbol must have qualified_name and kind"

    # Validate dependencies
    if not isinstance(data.get("dependencies"), list):
        return False, "dependencies must be a list"

    for dep in data["dependencies"]:
        if not isinstance(dep, dict):
            return False, "Each dependency must be a dictionary"
        if "from_sym" not in dep or "to_sym" not in dep:
            return False, "Each dependency must have from_sym and to_sym"

    logger.debug("Code map validation passed")
    return True, ""


def get_json_schema() -> dict[str, Any]:
    """Get the JSON Schema definition for CODE_MAP.json.

    Returns:
        JSON Schema as a dictionary.
    """
    schema: dict[str, Any] = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "CodeMap Schema",
        "description": "Code dependency and symbol map for Python projects",
        "type": "object",
        "required": ["version", "generated_at", "source_root", "symbols", "dependencies"],
        "properties": {
            "schema": {
                "type": "string",
                "description": "URL of this JSON schema",
            },
            "version": {
                "type": "string",
                "description": "Schema version (e.g., 1.0)",
                "pattern": r"^\d+\.\d+$",
            },
            "generated_at": {
                "type": "string",
                "description": "ISO 8601 timestamp of generation",
                "format": "date-time",
            },
            "source_root": {
                "type": "string",
                "description": "Root directory of analyzed source code",
            },
            "symbols": {
                "type": "array",
                "description": "All symbols found in the codebase",
                "items": {
                    "type": "object",
                    "required": ["qualified_name", "kind", "file", "line"],
                    "properties": {
                        "qualified_name": {
                            "type": "string",
                            "description": (
                                "Fully qualified symbol name (e.g., module.class.method)"
                            ),
                        },
                        "kind": {
                            "type": "string",
                            "enum": ["module", "class", "function", "method"],
                            "description": "Type of symbol",
                        },
                        "file": {
                            "type": "string",
                            "description": "Path to file containing symbol",
                        },
                        "line": {
                            "type": "integer",
                            "description": "Line number of symbol definition",
                        },
                        "column": {
                            "type": "integer",
                            "description": "Column number of symbol definition",
                        },
                        "docstring": {
                            "type": "string",
                            "description": "Docstring for the symbol",
                        },
                        "signature": {
                            "type": "string",
                            "description": "Function/method signature",
                        },
                        "task_links": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Task IDs from DEVELOPMENT_PLAN this symbol implements",
                        },
                    },
                },
            },
            "dependencies": {
                "type": "array",
                "description": "All detected dependencies between symbols",
                "items": {
                    "type": "object",
                    "required": ["from_sym", "to_sym"],
                    "properties": {
                        "from_sym": {
                            "type": "string",
                            "description": "Source symbol qualified name",
                        },
                        "to_sym": {
                            "type": "string",
                            "description": "Target symbol qualified name",
                        },
                        "kind": {
                            "type": "string",
                            "enum": ["calls", "imports", "inherits"],
                            "description": "Type of dependency",
                        },
                        "locations": {
                            "type": "array",
                            "description": "Where this dependency occurs in source",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "file": {"type": "string"},
                                    "line": {"type": "integer"},
                                },
                            },
                        },
                    },
                },
            },
        },
    }
    return schema
