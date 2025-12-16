"""Tests for graph query methods."""

from __future__ import annotations

from codemap.analyzer.graph import DependencyGraph


def test_get_ancestors() -> None:
    """Test getting ancestors (upstream) of a symbol."""
    graph = DependencyGraph()
    # Create chain: a -> b -> c -> d
    graph.add_dependency("a", "b")
    graph.add_dependency("b", "c")
    graph.add_dependency("c", "d")

    ancestors_of_d = graph.get_callers("d")
    assert "c" in ancestors_of_d
    assert "b" in ancestors_of_d
    assert "a" in ancestors_of_d


def test_get_descendants() -> None:
    """Test getting descendants (downstream) of a symbol."""
    graph = DependencyGraph()
    # Create chain: a -> b -> c -> d
    graph.add_dependency("a", "b")
    graph.add_dependency("b", "c")
    graph.add_dependency("c", "d")

    descendants_of_a = graph.get_callees("a")
    assert "b" in descendants_of_a
    assert "c" in descendants_of_a
    assert "d" in descendants_of_a


def test_get_module_dependencies() -> None:
    """Test getting all dependencies of a module."""
    graph = DependencyGraph()
    graph.add_dependency("auth.validate", "crypto.hash")
    graph.add_dependency("auth.login", "auth.validate")
    graph.add_dependency("api.routes", "auth.login")

    # Direct dependencies of auth module symbols
    auth_deps = []
    for node in graph.get_nodes():
        if node.startswith("auth"):
            auth_deps.extend(graph.get_callees(node))

    assert "crypto.hash" in auth_deps


def test_find_cycles_complex() -> None:
    """Test finding cycles in more complex graph."""
    graph = DependencyGraph()
    # Multiple cycles
    # Cycle 1: a -> b -> c -> a
    graph.add_dependency("a", "b")
    graph.add_dependency("b", "c")
    graph.add_dependency("c", "a")

    cycles = graph.find_cycles()
    assert len(cycles) > 0


def test_depth_limited_query() -> None:
    """Test depth-limited queries."""
    graph = DependencyGraph()
    # Chain: a -> b -> c -> d -> e
    graph.add_dependency("a", "b")
    graph.add_dependency("b", "c")
    graph.add_dependency("c", "d")
    graph.add_dependency("d", "e")

    # Depth 1: only direct callees
    depth1 = graph.get_callees("a", depth=1)
    assert "b" in depth1
    assert "c" not in depth1

    # Depth 2: up to 2 hops
    depth2 = graph.get_callees("a", depth=2)
    assert "b" in depth2
    assert "c" in depth2
    assert "d" not in depth2
