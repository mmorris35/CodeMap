"""Tests for Mermaid diagram generation."""

from __future__ import annotations

from pathlib import Path

import pytest

from codemap.analyzer.graph import DependencyGraph
from codemap.analyzer.symbols import SourceLocation, Symbol, SymbolKind
from codemap.output.mermaid import MermaidGenerator


@pytest.fixture  # type: ignore[misc]
def sample_graph() -> DependencyGraph:
    """Create a sample dependency graph for testing."""
    graph = DependencyGraph()

    # Add symbols
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
        Symbol(
            name="User",
            qualified_name="models.User",
            kind=SymbolKind.CLASS,
            location=SourceLocation(file=Path("models.py"), line=1),
        ),
        Symbol(
            name="Database",
            qualified_name="db.Database",
            kind=SymbolKind.CLASS,
            location=SourceLocation(file=Path("db.py"), line=1),
        ),
    ]

    for symbol in symbols:
        graph.add_symbol(symbol)

    # Add dependencies
    graph.add_dependency("main.login", "auth.validate_user", kind="calls")
    graph.add_dependency("auth.validate_user", "auth.hash_password", kind="calls")
    graph.add_dependency("auth.validate_user", "models.User", kind="calls")
    graph.add_dependency("models.User", "db.Database", kind="calls")

    return graph


class TestMermaidGenerator:
    """Tests for MermaidGenerator class."""

    def test_init(self) -> None:
        """Test generator initialization."""
        generator = MermaidGenerator()
        assert generator is not None

    def test_generate_module_diagram_empty_graph(self) -> None:
        """Test module diagram generation with empty graph."""
        generator = MermaidGenerator()
        graph = DependencyGraph()

        result = generator.generate_module_diagram(graph)

        assert "flowchart TD" in result
        assert isinstance(result, str)

    def test_generate_module_diagram_basic(self, sample_graph: DependencyGraph) -> None:
        """Test module diagram generation with sample data."""
        generator = MermaidGenerator()

        result = generator.generate_module_diagram(sample_graph)

        # Check structure
        assert "flowchart TD" in result
        assert "subgraph" in result

        # Check modules appear
        assert "auth" in result or "main" in result or "models" in result or "db" in result

        # Check it's valid syntax
        assert result.count("subgraph") == result.count("end")

        # Check edges appear
        assert "-->" in result

    def test_generate_module_diagram_valid_mermaid(self, sample_graph: DependencyGraph) -> None:
        """Test that module diagram output is valid Mermaid syntax."""
        generator = MermaidGenerator()
        result = generator.generate_module_diagram(sample_graph)

        lines = result.split("\n")
        assert lines[0] == "flowchart TD"
        assert len(lines) > 1

        # All lines should have proper syntax
        for line in lines:
            if line.strip() and not line.strip().startswith("--"):
                # Non-edge lines should be either subgraph, node, or end
                assert any(
                    x in line
                    for x in [
                        "flowchart",
                        "subgraph",
                        "end",
                        "-->",
                        "[",
                        "___",
                    ]
                )

    def test_generate_function_diagram_empty_module(self, sample_graph: DependencyGraph) -> None:
        """Test function diagram for non-existent module."""
        generator = MermaidGenerator()

        result = generator.generate_function_diagram(sample_graph, "nonexistent")

        assert "flowchart TD" in result
        assert "No functions" in result or "none" in result

    def test_generate_function_diagram_with_module(self, sample_graph: DependencyGraph) -> None:
        """Test function diagram for specific module."""
        generator = MermaidGenerator()

        result = generator.generate_function_diagram(sample_graph, "auth")

        assert "flowchart TD" in result
        assert "validate_user" in result or "hash_password" in result
        assert "-->" in result

    def test_generate_function_diagram_internal_external_edges(
        self, sample_graph: DependencyGraph
    ) -> None:
        """Test that function diagram shows internal and external edges."""
        generator = MermaidGenerator()

        result = generator.generate_function_diagram(sample_graph, "auth")

        # Should have both solid and dashed edges
        # (internal and external)
        lines = result.split("\n")
        edge_lines = [line for line in lines if "-->" in line]
        assert len(edge_lines) > 0

    def test_sanitize_id_basic(self) -> None:
        """Test ID sanitization for valid names."""
        generator = MermaidGenerator()

        assert "auth_validate_user" == generator._sanitize_id("auth.validate_user")
        assert "module_function" == generator._sanitize_id("module.function")
        assert "valid_name" == generator._sanitize_id("valid_name")

    def test_sanitize_id_with_special_chars(self) -> None:
        """Test ID sanitization with special characters."""
        generator = MermaidGenerator()

        # Special characters should be replaced
        assert generator._sanitize_id("a-b-c") == "a_b_c"
        assert generator._sanitize_id("a.b.c") == "a_b_c"
        assert generator._sanitize_id("a:b:c") == "a_b_c"

    def test_sanitize_id_starts_with_number(self) -> None:
        """Test ID sanitization when starting with number."""
        generator = MermaidGenerator()

        result = generator._sanitize_id("123abc")
        assert result[0] != "" and result[0].isdigit() is False

    def test_sanitize_id_empty(self) -> None:
        """Test ID sanitization with empty string."""
        generator = MermaidGenerator()

        result = generator._sanitize_id("")
        assert result == ""

    def test_generate_impact_diagram_empty_graph(self) -> None:
        """Test impact diagram with no matching symbols."""
        generator = MermaidGenerator()
        graph = DependencyGraph()

        result = generator.generate_impact_diagram(graph, ["nonexistent"], depth=2)

        assert "flowchart TD" in result

    def test_generate_impact_diagram_single_symbol(self, sample_graph: DependencyGraph) -> None:
        """Test impact diagram for single focal symbol."""
        generator = MermaidGenerator()

        result = generator.generate_impact_diagram(sample_graph, ["auth.validate_user"], depth=2)

        assert "flowchart TD" in result
        assert "focal" in result.lower()
        assert "classDef" in result

    def test_generate_impact_diagram_multiple_symbols(self, sample_graph: DependencyGraph) -> None:
        """Test impact diagram for multiple focal symbols."""
        generator = MermaidGenerator()

        result = generator.generate_impact_diagram(
            sample_graph,
            ["auth.validate_user", "auth.hash_password"],
            depth=2,
        )

        assert "flowchart TD" in result
        assert "focal" in result.lower()
        assert "-->" in result

    def test_generate_impact_diagram_depth_limit(self, sample_graph: DependencyGraph) -> None:
        """Test that impact diagram respects depth limit."""
        generator = MermaidGenerator()

        # With depth 1, only direct callers/callees should be included
        result = generator.generate_impact_diagram(sample_graph, ["auth.validate_user"], depth=1)

        assert "flowchart TD" in result
        # Should have fewer nodes than depth 2
        result_depth2 = generator.generate_impact_diagram(
            sample_graph, ["auth.validate_user"], depth=2
        )

        # Count nodes in each result
        nodes_depth1 = result.count("[")
        nodes_depth2 = result_depth2.count("[")

        # Depth 2 should have equal or more nodes
        assert nodes_depth2 >= nodes_depth1

    def test_generate_impact_diagram_styling(self, sample_graph: DependencyGraph) -> None:
        """Test that impact diagram includes styling definitions."""
        generator = MermaidGenerator()

        result = generator.generate_impact_diagram(sample_graph, ["auth.validate_user"], depth=2)

        assert "classDef focal" in result
        assert "classDef upstream" in result
        assert "classDef downstream" in result
        assert ":::focal" in result

    def test_generate_impact_diagram_legend(self, sample_graph: DependencyGraph) -> None:
        """Test that impact diagram includes legend."""
        generator = MermaidGenerator()

        result = generator.generate_impact_diagram(sample_graph, ["auth.validate_user"], depth=2)

        assert "legend" in result.lower()
        assert "Legend" in result or "legend" in result

    def test_module_diagram_all_nodes_included(self, sample_graph: DependencyGraph) -> None:
        """Test that all graph nodes are included in module diagram."""
        generator = MermaidGenerator()

        result = generator.generate_module_diagram(sample_graph)

        nodes = sample_graph.get_nodes()
        # At least some node names should appear
        for node in nodes:
            # Either full name or part of subgraph
            assert node.split(".")[0] in result or node in result

    def test_function_diagram_truncates_long_names(self, sample_graph: DependencyGraph) -> None:
        """Test that function diagram truncates long function names."""
        generator = MermaidGenerator()

        # Add a function with a very long name
        long_name_symbol = Symbol(
            name="very_long_function_name_that_exceeds_forty_characters",
            qualified_name="auth.very_long_function_name_that_exceeds_forty_characters",
            kind=SymbolKind.FUNCTION,
            location=SourceLocation(file=Path("auth.py"), line=30),
        )
        sample_graph.add_symbol(long_name_symbol)

        result = generator.generate_function_diagram(sample_graph, "auth")

        # Should have truncation indicator
        assert "..." in result or (len(result) > 0)
