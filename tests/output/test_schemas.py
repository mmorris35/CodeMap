"""Tests for CodeMap output schemas."""

from __future__ import annotations

from typing import Any

from codemap.output.schemas import (
    CodeMapSchema,
    DependencyEntry,
    LocationEntry,
    SymbolEntry,
    get_json_schema,
    validate_code_map,
)


class TestSchemas:
    """Tests for schema definitions."""

    def test_symbol_entry_type(self) -> None:
        """Test that SymbolEntry TypedDict can be created."""
        symbol: SymbolEntry = {
            "qualified_name": "auth.validate",
            "kind": "function",
            "file": "auth.py",
            "line": 10,
        }
        assert symbol["qualified_name"] == "auth.validate"
        assert symbol["kind"] == "function"

    def test_symbol_entry_optional_fields(self) -> None:
        """Test optional fields in SymbolEntry."""
        symbol: SymbolEntry = {
            "qualified_name": "auth.validate",
            "kind": "function",
            "file": "auth.py",
            "line": 10,
            "docstring": "Validate user",
            "signature": "(user: str) -> bool",
            "task_links": ["1.2.3", "2.1.1"],
        }
        assert symbol.get("docstring") == "Validate user"
        assert symbol.get("task_links") == ["1.2.3", "2.1.1"]

    def test_location_entry_type(self) -> None:
        """Test LocationEntry TypedDict."""
        location: LocationEntry = {
            "file": "main.py",
            "line": 42,
        }
        assert location["file"] == "main.py"
        assert location["line"] == 42

    def test_dependency_entry_type(self) -> None:
        """Test DependencyEntry TypedDict."""
        dependency: DependencyEntry = {
            "from_sym": "main.login",
            "to_sym": "auth.validate",
            "kind": "calls",
            "locations": [{"file": "main.py", "line": 15}],
        }
        assert dependency["from_sym"] == "main.login"
        assert dependency["to_sym"] == "auth.validate"
        assert dependency["kind"] == "calls"

    def test_code_map_schema_type(self) -> None:
        """Test CodeMapSchema TypedDict."""
        code_map: CodeMapSchema = {
            "version": "1.0",
            "generated_at": "2024-01-15T10:30:00Z",
            "source_root": "./src",
            "symbols": [],
            "dependencies": [],
        }
        assert code_map["version"] == "1.0"
        assert code_map["source_root"] == "./src"


class TestValidation:
    """Tests for schema validation."""

    def test_validate_valid_code_map(self) -> None:
        """Test validation of valid code map."""
        code_map: dict[str, Any] = {
            "version": "1.0",
            "generated_at": "2024-01-15T10:30:00Z",
            "source_root": "./src",
            "symbols": [
                {
                    "qualified_name": "auth.validate",
                    "kind": "function",
                    "file": "auth.py",
                    "line": 10,
                }
            ],
            "dependencies": [
                {
                    "from_sym": "main.login",
                    "to_sym": "auth.validate",
                    "kind": "calls",
                }
            ],
        }

        is_valid, msg = validate_code_map(code_map)
        assert is_valid is True
        assert msg == ""

    def test_validate_not_dict(self) -> None:
        """Test validation fails for non-dict."""
        is_valid, msg = validate_code_map([])
        assert is_valid is False
        assert "dictionary" in msg

    def test_validate_missing_required_field(self) -> None:
        """Test validation fails for missing required fields."""
        code_map = {
            "version": "1.0",
            "generated_at": "2024-01-15T10:30:00Z",
            "symbols": [],
            "dependencies": [],
        }

        is_valid, msg = validate_code_map(code_map)
        assert is_valid is False
        assert "source_root" in msg

    def test_validate_invalid_symbols(self) -> None:
        """Test validation fails for invalid symbols."""
        code_map: dict[str, Any] = {
            "version": "1.0",
            "generated_at": "2024-01-15T10:30:00Z",
            "source_root": "./src",
            "symbols": "not a list",
            "dependencies": [],
        }

        is_valid, msg = validate_code_map(code_map)
        assert is_valid is False
        assert "must be a list" in msg

    def test_validate_symbol_missing_qualified_name(self) -> None:
        """Test validation fails for symbol without qualified_name."""
        code_map: dict[str, Any] = {
            "version": "1.0",
            "generated_at": "2024-01-15T10:30:00Z",
            "source_root": "./src",
            "symbols": [{"kind": "function"}],
            "dependencies": [],
        }

        is_valid, msg = validate_code_map(code_map)
        assert is_valid is False
        assert "qualified_name" in msg

    def test_validate_invalid_dependencies(self) -> None:
        """Test validation fails for invalid dependencies."""
        code_map: dict[str, Any] = {
            "version": "1.0",
            "generated_at": "2024-01-15T10:30:00Z",
            "source_root": "./src",
            "symbols": [],
            "dependencies": "not a list",
        }

        is_valid, msg = validate_code_map(code_map)
        assert is_valid is False
        assert "must be a list" in msg

    def test_validate_dependency_missing_from_sym(self) -> None:
        """Test validation fails for dependency without from_sym."""
        code_map: dict[str, Any] = {
            "version": "1.0",
            "generated_at": "2024-01-15T10:30:00Z",
            "source_root": "./src",
            "symbols": [],
            "dependencies": [{"to_sym": "target"}],
        }

        is_valid, msg = validate_code_map(code_map)
        assert is_valid is False
        assert "from_sym" in msg


class TestJsonSchema:
    """Tests for JSON schema generation."""

    def test_get_json_schema_structure(self) -> None:
        """Test that JSON schema has correct structure."""
        schema = get_json_schema()

        assert "$schema" in schema
        assert "title" in schema
        assert "type" in schema
        assert schema["type"] == "object"

    def test_get_json_schema_has_required_fields(self) -> None:
        """Test JSON schema specifies required fields."""
        schema = get_json_schema()

        required = schema.get("required", [])
        assert "version" in required
        assert "generated_at" in required
        assert "source_root" in required
        assert "symbols" in required
        assert "dependencies" in required

    def test_get_json_schema_has_properties(self) -> None:
        """Test JSON schema defines all properties."""
        schema = get_json_schema()
        properties = schema.get("properties", {})

        assert "version" in properties
        assert "generated_at" in properties
        assert "source_root" in properties
        assert "symbols" in properties
        assert "dependencies" in properties

    def test_json_schema_symbols_structure(self) -> None:
        """Test symbols property structure in JSON schema."""
        schema = get_json_schema()
        symbols_prop = schema["properties"]["symbols"]

        assert symbols_prop["type"] == "array"
        assert "items" in symbols_prop
        assert symbols_prop["items"]["type"] == "object"

    def test_json_schema_symbol_required_fields(self) -> None:
        """Test required fields for symbol items."""
        schema = get_json_schema()
        symbol_schema = schema["properties"]["symbols"]["items"]

        required = symbol_schema.get("required", [])
        assert "qualified_name" in required
        assert "kind" in required
        assert "file" in required
        assert "line" in required

    def test_json_schema_dependency_structure(self) -> None:
        """Test dependencies property structure."""
        schema = get_json_schema()
        deps_prop = schema["properties"]["dependencies"]

        assert deps_prop["type"] == "array"
        assert "items" in deps_prop
        assert deps_prop["items"]["type"] == "object"

    def test_json_schema_dependency_required_fields(self) -> None:
        """Test required fields for dependency items."""
        schema = get_json_schema()
        dep_schema = schema["properties"]["dependencies"]["items"]

        required = dep_schema.get("required", [])
        assert "from_sym" in required
        assert "to_sym" in required

    def test_json_schema_symbol_kind_enum(self) -> None:
        """Test that symbol kind is constrained to enum."""
        schema = get_json_schema()
        symbol_schema = schema["properties"]["symbols"]["items"]
        kind_schema = symbol_schema["properties"]["kind"]

        assert "enum" in kind_schema
        assert set(kind_schema["enum"]) == {"module", "class", "function", "method"}

    def test_json_schema_dependency_kind_enum(self) -> None:
        """Test that dependency kind is constrained to enum."""
        schema = get_json_schema()
        dep_schema = schema["properties"]["dependencies"]["items"]
        kind_schema = dep_schema["properties"]["kind"]

        assert "enum" in kind_schema
        assert set(kind_schema["enum"]) == {"calls", "imports", "inherits"}

    def test_json_schema_version_pattern(self) -> None:
        """Test that version follows semantic versioning pattern."""
        schema = get_json_schema()
        version_schema = schema["properties"]["version"]

        assert "pattern" in version_schema
        # Pattern should match x.y format
        pattern = version_schema["pattern"]
        assert "\\d" in pattern

    def test_json_schema_generated_at_format(self) -> None:
        """Test that generated_at has date-time format."""
        schema = get_json_schema()
        generated_at_schema = schema["properties"]["generated_at"]

        assert generated_at_schema.get("format") == "date-time"

    def test_json_schema_is_valid_json_schema(self) -> None:
        """Test that generated schema is itself valid JSON."""
        schema = get_json_schema()

        # Should be serializable
        import json

        json_str = json.dumps(schema)
        assert len(json_str) > 0

        # Should be deserializable
        parsed = json.loads(json_str)
        assert parsed["title"] == schema["title"]
