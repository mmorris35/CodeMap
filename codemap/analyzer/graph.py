"""Dependency graph using NetworkX."""

from __future__ import annotations

from typing import TYPE_CHECKING

import networkx as nx

from codemap.analyzer.symbols import Symbol
from codemap.logging_config import get_logger

if TYPE_CHECKING:
    pass

logger = get_logger(__name__)


class DependencyGraph:
    """Wrapper around NetworkX DiGraph for code dependencies."""

    def __init__(self) -> None:
        """Initialize empty directed graph."""
        self._graph: nx.DiGraph[str] = nx.DiGraph()

    def add_symbol(self, symbol: Symbol) -> None:
        """Add a symbol as a node.

        Args:
            symbol: Symbol to add.
        """
        self._graph.add_node(
            symbol.qualified_name,
            kind=symbol.kind.value,
            location=symbol.location,
            docstring=symbol.docstring,
        )

    def add_dependency(
        self,
        from_sym: str,
        to_sym: str,
        kind: str = "calls",
        location: str | None = None,
    ) -> None:
        """Add a dependency edge between symbols.

        Args:
            from_sym: Source symbol qualified name.
            to_sym: Target symbol qualified name.
            kind: Type of relationship (calls, imports, inherits).
            location: Location where dependency occurs.
        """
        # Ensure both nodes exist
        if from_sym not in self._graph:
            self._graph.add_node(from_sym)
        if to_sym not in self._graph:
            self._graph.add_node(to_sym)

        # Add edge with attributes
        if self._graph.has_edge(from_sym, to_sym):
            # Update existing edge
            edge_data = self._graph[from_sym][to_sym]
            locations = edge_data.get("locations", [])
            if location and location not in locations:
                locations.append(location)
            edge_data["locations"] = locations
        else:
            # Add new edge
            locations = [location] if location else []
            self._graph.add_edge(
                from_sym,
                to_sym,
                kind=kind,
                locations=locations,
            )

    def get_nodes(self) -> list[str]:
        """Get all node names.

        Returns:
            List of symbol qualified names.
        """
        return list(self._graph.nodes())

    def get_edges(self) -> list[tuple[str, str]]:
        """Get all edges.

        Returns:
            List of (from_sym, to_sym) tuples.
        """
        return list(self._graph.edges())

    def has_node(self, symbol: str) -> bool:
        """Check if symbol exists in graph.

        Args:
            symbol: Qualified symbol name.

        Returns:
            True if node exists.
        """
        return bool(self._graph.has_node(symbol))

    def get_callers(self, symbol: str, depth: int | None = None) -> list[str]:
        """Get all symbols that call this symbol.

        Args:
            symbol: Target symbol.
            depth: Max traversal depth.

        Returns:
            List of calling symbols.
        """
        if not self._graph.has_node(symbol):
            return []

        callers = set()
        visited = set()

        def traverse(node: str, current_depth: int = 0) -> None:
            if node in visited:
                return
            visited.add(node)

            if depth is not None and current_depth > depth:
                return

            # Get predecessors (nodes with edges to this node)
            for predecessor in self._graph.predecessors(node):
                callers.add(predecessor)
                traverse(predecessor, current_depth + 1)

        traverse(symbol)
        return sorted(list(callers))

    def get_callees(self, symbol: str, depth: int | None = None) -> list[str]:
        """Get all symbols this symbol calls.

        Args:
            symbol: Source symbol.
            depth: Max traversal depth.

        Returns:
            List of called symbols.
        """
        if not self._graph.has_node(symbol):
            return []

        callees = set()
        visited = set()

        def traverse(node: str, current_depth: int = 0) -> None:
            if node in visited:
                return
            visited.add(node)

            if depth is not None and current_depth >= depth:
                return

            # Get successors (nodes this node has edges to)
            for successor in self._graph.successors(node):
                callees.add(successor)
                traverse(successor, current_depth + 1)

        traverse(symbol)
        return sorted(list(callees))

    def find_cycles(self) -> list[list[str]]:
        """Find all cycles in the graph.

        Returns:
            List of cycles, each cycle is a list of node names.
        """
        try:
            cycles = list(nx.simple_cycles(self._graph))
            return sorted([sorted(cycle) for cycle in cycles])
        except Exception as error:
            logger.error("Error finding cycles: %s", error)
            return []

    def __len__(self) -> int:
        """Get number of nodes in graph."""
        return len(self._graph)

    def __contains__(self, symbol: str) -> bool:
        """Check if symbol is in graph."""
        return bool(self._graph.has_node(symbol))

    def add_symbol_data(self, symbol_data: dict[str, object]) -> None:
        """Add a symbol from CODE_MAP.json data.

        Args:
            symbol_data: Symbol dictionary from CODE_MAP.json
        """
        qualified_name = symbol_data.get("qualified_name", "")
        if isinstance(qualified_name, str):
            self._graph.add_node(
                qualified_name,
                kind=symbol_data.get("kind", "function"),
            )
