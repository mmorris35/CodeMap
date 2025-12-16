"""Tests for CODE_MAP.json generation and handling."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

from codemap.analyzer.graph import DependencyGraph
from codemap.analyzer.symbols import SourceLocation, Symbol, SymbolKind, SymbolRegistry
from codemap.output.code_map import CodeMapGenerator


@pytest.fixture  # type: ignore[misc]
def sample_registry() -> SymbolRegistry:
    """Create a sample symbol registry."""
    registry = SymbolRegistry()

    symbols = [
        Symbol(
            name="validate_user",
            qualified_name="auth.validate_user",
            kind=SymbolKind.FUNCTION,
            location=SourceLocation(file=Path("auth.py"), line=10),
            docstring="Validate user credentials",
            signature="(user: str) -> bool",
        ),
        Symbol(
            name="hash_password",
            qualified_name="auth.hash_password",
            kind=SymbolKind.FUNCTION,
            location=SourceLocation(file=Path("auth.py"), line=20),
        ),
        Symbol(
            name="login",
            qualified_name="main.login",
            kind=SymbolKind.FUNCTION,
            location=SourceLocation(file=Path("main.py"), line=5),
        ),
    ]

    for symbol in symbols:
        registry.add(symbol)

    return registry


@pytest.fixture  # type: ignore[misc]
def sample_graph() -> DependencyGraph:
    """Create a sample dependency graph."""
    graph = DependencyGraph()

    symbols = [
        Symbol(
            name="validate_user",
            qualified_name="auth.validate_user",
            kind=SymbolKind.FUNCTION,
            location=SourceLocation(file=Path("auth.py"), line=10),
            docstring="Validate user credentials",
        ),
        Symbol(
            name="hash_password",
            qualified_name="auth.hash_password",
            kind=SymbolKind.FUNCTION,
            location=SourceLocation(file=Path("auth.py"), line=20),
        ),
        Symbol(
            name="login",
            qualified_name="main.login",
            kind=SymbolKind.FUNCTION,
            location=SourceLocation(file=Path("main.py"), line=5),
        ),
    ]

    for symbol in symbols:
        graph.add_symbol(symbol)

    # Add dependencies
    graph.add_dependency("main.login", "auth.validate_user", kind="calls")
    graph.add_dependency("auth.validate_user", "auth.hash_password", kind="calls")

    return graph


class TestCodeMapGenerator:
    """Tests for CodeMapGenerator."""

    def test_init(self) -> None:
        """Test generator initialization."""
        generator = CodeMapGenerator()
        assert generator is not None

    def test_generate_basic(
        self, sample_graph: DependencyGraph, sample_registry: SymbolRegistry
    ) -> None:
        """Test basic CODE_MAP generation."""
        generator = CodeMapGenerator()

        result = generator.generate(sample_graph, sample_registry, source_root="./src")

        assert result["version"] == "1.0"
        assert result["source_root"] == "./src"
        assert "generated_at" in result
        assert isinstance(result["symbols"], list)
        assert isinstance(result["dependencies"], list)

    def test_generate_symbols(
        self, sample_graph: DependencyGraph, sample_registry: SymbolRegistry
    ) -> None:
        """Test that all symbols are included."""
        generator = CodeMapGenerator()

        result = generator.generate(sample_graph, sample_registry)

        assert len(result["symbols"]) == 3

        # Check symbol details
        auth_validate = next(
            (s for s in result["symbols"] if s["qualified_name"] == "auth.validate_user"),
            None,
        )
        assert auth_validate is not None
        assert auth_validate["kind"] == "function"
        assert auth_validate["file"] == "auth.py"
        assert auth_validate["line"] == 10
        assert "Validate user" in auth_validate.get("docstring", "")

    def test_generate_dependencies(
        self, sample_graph: DependencyGraph, sample_registry: SymbolRegistry
    ) -> None:
        """Test that dependencies are included."""
        generator = CodeMapGenerator()

        result = generator.generate(sample_graph, sample_registry)

        assert len(result["dependencies"]) == 2

        # Check dependency details
        dep1 = next(
            (
                d
                for d in result["dependencies"]
                if d["from_sym"] == "main.login" and d["to_sym"] == "auth.validate_user"
            ),
            None,
        )
        assert dep1 is not None
        assert dep1["kind"] == "calls"

    def test_generate_timestamp(
        self, sample_graph: DependencyGraph, sample_registry: SymbolRegistry
    ) -> None:
        """Test that generated_at contains valid timestamp."""
        generator = CodeMapGenerator()

        result = generator.generate(sample_graph, sample_registry)

        timestamp = result["generated_at"]
        # Should be ISO 8601 format
        assert "T" in timestamp
        assert "+" in timestamp or "Z" in timestamp or timestamp.endswith("0000")

    def test_generate_deterministic(
        self, sample_graph: DependencyGraph, sample_registry: SymbolRegistry
    ) -> None:
        """Test that output is deterministic (sorted keys)."""
        generator = CodeMapGenerator()

        result1 = generator.generate(sample_graph, sample_registry)
        result2 = generator.generate(sample_graph, sample_registry)

        # Check symbols are in same order
        assert [s["qualified_name"] for s in result1["symbols"]] == [
            s["qualified_name"] for s in result2["symbols"]
        ]

        # Check dependencies are in same order
        assert [d["from_sym"] for d in result1["dependencies"]] == [
            d["from_sym"] for d in result2["dependencies"]
        ]


class TestCodeMapSave:
    """Tests for saving CODE_MAP."""

    def test_save_creates_file(
        self, sample_graph: DependencyGraph, sample_registry: SymbolRegistry
    ) -> None:
        """Test that save creates the file."""
        generator = CodeMapGenerator()
        code_map = generator.generate(sample_graph, sample_registry)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "code_map.json"
            generator.save(code_map, path)

            assert path.exists()
            assert path.is_file()

    def test_save_valid_json(
        self, sample_graph: DependencyGraph, sample_registry: SymbolRegistry
    ) -> None:
        """Test that saved file is valid JSON."""
        generator = CodeMapGenerator()
        code_map = generator.generate(sample_graph, sample_registry)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "code_map.json"
            generator.save(code_map, path)

            # Load and verify
            with open(path, "r") as f:
                loaded = json.load(f)
            assert loaded["version"] == "1.0"

    def test_save_pretty_printed(
        self, sample_graph: DependencyGraph, sample_registry: SymbolRegistry
    ) -> None:
        """Test that JSON is pretty-printed."""
        generator = CodeMapGenerator()
        code_map = generator.generate(sample_graph, sample_registry)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "code_map.json"
            generator.save(code_map, path)

            with open(path, "r") as f:
                content = f.read()

            # Should have indentation
            assert "  " in content
            assert "\n" in content

    def test_save_creates_parent_dir(
        self, sample_graph: DependencyGraph, sample_registry: SymbolRegistry
    ) -> None:
        """Test that save creates parent directories."""
        generator = CodeMapGenerator()
        code_map = generator.generate(sample_graph, sample_registry)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "subdir" / "nested" / "code_map.json"
            generator.save(code_map, path)

            assert path.exists()

    def test_save_invalid_schema_fails(self) -> None:
        """Test that saving invalid schema raises error."""
        generator = CodeMapGenerator()

        invalid_map = {
            "version": "1.0",
            # Missing required fields
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "code_map.json"
            with pytest.raises(ValueError):
                generator.save(invalid_map, path)  # type: ignore[arg-type]


class TestCodeMapLoad:
    """Tests for loading CODE_MAP."""

    def test_load_existing_file(
        self, sample_graph: DependencyGraph, sample_registry: SymbolRegistry
    ) -> None:
        """Test loading an existing CODE_MAP file."""
        generator = CodeMapGenerator()
        code_map = generator.generate(sample_graph, sample_registry)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "code_map.json"
            generator.save(code_map, path)

            loaded = generator.load(path)
            assert loaded["version"] == "1.0"
            assert len(loaded["symbols"]) == 3

    def test_load_nonexistent_file(self) -> None:
        """Test loading nonexistent file raises error."""
        generator = CodeMapGenerator()
        path = Path("/nonexistent/code_map.json")

        with pytest.raises(FileNotFoundError):
            generator.load(path)

    def test_load_invalid_json(self) -> None:
        """Test loading invalid JSON raises error."""
        generator = CodeMapGenerator()

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "invalid.json"
            path.write_text("{ invalid json }")

            with pytest.raises(json.JSONDecodeError):
                generator.load(path)

    def test_load_invalid_schema(self) -> None:
        """Test loading invalid schema raises error."""
        generator = CodeMapGenerator()

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "invalid_schema.json"
            invalid_map = {
                "version": "1.0",
                # Missing required fields
            }
            path.write_text(json.dumps(invalid_map))

            with pytest.raises(ValueError):
                generator.load(path)

    def test_load_roundtrip(
        self, sample_graph: DependencyGraph, sample_registry: SymbolRegistry
    ) -> None:
        """Test save/load roundtrip preserves data."""
        generator = CodeMapGenerator()
        original = generator.generate(sample_graph, sample_registry)

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "code_map.json"
            generator.save(original, path)
            loaded = generator.load(path)

            assert loaded["version"] == original["version"]
            assert len(loaded["symbols"]) == len(original["symbols"])
            assert len(loaded["dependencies"]) == len(original["dependencies"])

            # Check symbol details preserved
            for orig_sym, loaded_sym in zip(original["symbols"], loaded["symbols"]):
                assert orig_sym["qualified_name"] == loaded_sym["qualified_name"]
                assert orig_sym["kind"] == loaded_sym["kind"]

    def test_generate_contains_schema_url(
        self, sample_graph: DependencyGraph, sample_registry: SymbolRegistry
    ) -> None:
        """Test that generated map includes schema URL."""
        generator = CodeMapGenerator()
        result = generator.generate(sample_graph, sample_registry)

        assert "schema" in result
        assert "http" in result["schema"]
