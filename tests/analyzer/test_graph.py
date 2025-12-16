"""Tests for dependency graph."""

from __future__ import annotations

from pathlib import Path

from codemap.analyzer.graph import DependencyGraph
from codemap.analyzer.symbols import SourceLocation, Symbol, SymbolKind


def test_graph_creation() -> None:
    """Test creating an empty graph."""
    graph = DependencyGraph()
    assert len(graph) == 0


def test_add_symbol() -> None:
    """Test adding symbols to graph."""
    graph = DependencyGraph()
    symbol = Symbol(
        name="func",
        qualified_name="mod.func",
        kind=SymbolKind.FUNCTION,
        location=SourceLocation(file=Path("test.py"), line=10),
    )
    graph.add_symbol(symbol)
    assert graph.has_node("mod.func")
    assert len(graph) == 1


def test_add_dependency() -> None:
    """Test adding dependencies."""
    graph = DependencyGraph()
    graph.add_dependency("mod.func1", "mod.func2", kind="calls")
    assert graph.has_node("mod.func1")
    assert graph.has_node("mod.func2")
    edges = graph.get_edges()
    assert ("mod.func1", "mod.func2") in edges


def test_get_callers() -> None:
    """Test finding callers."""
    graph = DependencyGraph()
    graph.add_dependency("a.foo", "b.bar")
    graph.add_dependency("c.baz", "b.bar")
    callers = graph.get_callers("b.bar")
    assert "a.foo" in callers
    assert "c.baz" in callers


def test_get_callees() -> None:
    """Test finding called functions."""
    graph = DependencyGraph()
    graph.add_dependency("a.foo", "b.bar")
    graph.add_dependency("a.foo", "c.baz")
    callees = graph.get_callees("a.foo")
    assert "b.bar" in callees
    assert "c.baz" in callees


def test_find_cycles() -> None:
    """Test cycle detection."""
    graph = DependencyGraph()
    # Create a cycle: a -> b -> c -> a
    graph.add_dependency("a", "b")
    graph.add_dependency("b", "c")
    graph.add_dependency("c", "a")

    cycles = graph.find_cycles()
    assert len(cycles) > 0
    # Should find the cycle a-b-c
    assert any(len(cycle) == 3 for cycle in cycles)


def test_no_cycles() -> None:
    """Test acyclic graph."""
    graph = DependencyGraph()
    graph.add_dependency("a", "b")
    graph.add_dependency("b", "c")
    cycles = graph.find_cycles()
    assert len(cycles) == 0


def test_graph_contains() -> None:
    """Test checking if symbol is in graph."""
    graph = DependencyGraph()
    graph.add_dependency("mod.func1", "mod.func2")
    assert "mod.func1" in graph
    assert "mod.func2" in graph
    assert "missing" not in graph


def test_transitive_closure() -> None:
    """Test finding transitive dependencies."""
    graph = DependencyGraph()
    # Create chain: a -> b -> c -> d
    graph.add_dependency("a", "b")
    graph.add_dependency("b", "c")
    graph.add_dependency("c", "d")

    # Direct callees of a
    direct = graph.get_callees("a", depth=1)
    assert "b" in direct
    assert "c" not in direct

    # All callees (transitively)
    all_callees = graph.get_callees("a")
    assert "b" in all_callees
    assert "c" in all_callees
    assert "d" in all_callees
