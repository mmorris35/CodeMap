"""Mermaid diagram generation for code dependencies."""

from __future__ import annotations

from typing import TYPE_CHECKING

from codemap.logging_config import get_logger

if TYPE_CHECKING:
    from codemap.analyzer.graph import DependencyGraph

logger = get_logger(__name__)


class MermaidGenerator:
    """Generates Mermaid diagrams from dependency graphs."""

    def __init__(self) -> None:
        """Initialize Mermaid generator."""
        self._sanitize_counter = 0

    def generate_module_diagram(self, graph: DependencyGraph) -> str:
        """Generate a module-level dependency diagram.

        Creates a flowchart showing module relationships, grouped by
        package hierarchies using subgraphs.

        Args:
            graph: Dependency graph to visualize.

        Returns:
            Valid Mermaid flowchart syntax as string.
        """
        logger.debug("Generating module-level diagram")
        lines: list[str] = ["flowchart TD"]

        nodes = graph.get_nodes()
        if not nodes:
            logger.warning("Graph has no nodes")
            return "\n".join(lines)

        # Extract unique modules from qualified names
        modules: set[str] = set()
        for node_name in nodes:
            # Get the top-level module (first part before dot)
            module = node_name.split(".")[0]
            modules.add(module)

        # Create subgraphs for each module
        module_to_nodes: dict[str, list[str]] = {}
        for module in sorted(modules):
            module_to_nodes[module] = []

        for node_name in nodes:
            module = node_name.split(".")[0]
            module_to_nodes[module].append(node_name)

        # Add subgraphs with nodes
        for module in sorted(modules):
            module_id = self._sanitize_id(module)
            lines.append(f'    subgraph {module_id}["{module}"]')

            for node_name in sorted(module_to_nodes[module]):
                node_id = self._sanitize_id(node_name)
                display_name = node_name.split(".")[-1]
                lines.append(f'        {node_id}["{display_name}()"]')

            lines.append("    end")

        # Add edges
        edges = graph.get_edges()
        for from_sym, to_sym in edges:
            from_id = self._sanitize_id(from_sym)
            to_id = self._sanitize_id(to_sym)
            lines.append(f"    {from_id} --> {to_id}")

        return "\n".join(lines)

    def generate_function_diagram(
        self,
        graph: DependencyGraph,
        module: str,
    ) -> str:
        """Generate a function-level diagram for a specific module.

        Shows all functions in a module with internal call relationships.
        External calls shown as dashed edges.

        Args:
            graph: Dependency graph to visualize.
            module: Module name to focus on (e.g., "auth").

        Returns:
            Valid Mermaid flowchart syntax as string.
        """
        logger.debug("Generating function-level diagram for module: %s", module)
        lines: list[str] = ["flowchart TD"]

        nodes = graph.get_nodes()

        # Filter nodes to those in the specified module
        module_nodes = [n for n in nodes if n.startswith(module + ".") or n == module]

        if not module_nodes:
            logger.warning("No functions found in module: %s", module)
            lines.append('    none["No functions in module"]')
            return "\n".join(lines)

        # Add nodes with signatures (truncated)
        for node_name in sorted(module_nodes):
            node_id = self._sanitize_id(node_name)
            # Extract just the function/class name
            parts = node_name.split(".")
            display_name = parts[-1]
            if len(display_name) > 40:
                display_name = display_name[:37] + "..."
            lines.append(f'    {node_id}["{display_name}()"]')

        # Add edges (internal and external)
        edges = graph.get_edges()
        for from_sym, to_sym in edges:
            from_in_module = any(from_sym.startswith(m + ".") or from_sym == m for m in [module])
            to_in_module = any(to_sym.startswith(m + ".") or to_sym == m for m in [module])

            # Only show edges where source is in module
            if not from_in_module:
                continue

            from_id = self._sanitize_id(from_sym)
            to_id = self._sanitize_id(to_sym)

            # Use dashed edge for external calls
            if to_in_module:
                lines.append(f"    {from_id} --> {to_id}")
            else:
                # External call - show with dashed line
                lines.append(f"    {from_id} -.-> {to_id}")

        return "\n".join(lines)

    def generate_impact_diagram(
        self,
        graph: DependencyGraph,
        symbols: list[str],
        depth: int = 2,
    ) -> str:
        """Generate a focused diagram showing impact of changes.

        Shows the focal symbols and their upstream/downstream dependencies
        up to the specified depth, with focal symbols highlighted.

        Args:
            graph: Dependency graph to visualize.
            symbols: Focal symbol names (e.g., ["auth.validate"]).
            depth: Max depth to traverse upstream and downstream.

        Returns:
            Valid Mermaid flowchart syntax as string.
        """
        logger.debug(
            "Generating impact diagram for symbols: %s, depth: %d",
            symbols,
            depth,
        )
        lines: list[str] = ["flowchart TD"]

        # Collect all nodes to include (focal + neighbors up to depth)
        nodes_to_include: set[str] = set()
        focal_nodes: set[str] = set()

        for symbol in symbols:
            if not graph.has_node(symbol):
                logger.warning("Symbol not in graph: %s", symbol)
                continue

            focal_nodes.add(symbol)
            nodes_to_include.add(symbol)

            # Get upstream dependencies (callers)
            callers = graph.get_callers(symbol, depth)
            nodes_to_include.update(callers)

            # Get downstream dependencies (callees)
            callees = graph.get_callees(symbol, depth)
            nodes_to_include.update(callees)

        if not nodes_to_include:
            logger.warning("No symbols found to diagram")
            lines.append('    none["No symbols found"]')
            return "\n".join(lines)

        # Add nodes with styling
        for node_name in sorted(nodes_to_include):
            node_id = self._sanitize_id(node_name)
            display_name = node_name.split(".")[-1]

            if node_name in focal_nodes:
                # Focal nodes with thick border
                lines.append(f'    {node_id}["{display_name}()"]:::focal')
            else:
                # Determine if upstream or downstream
                is_upstream = any(
                    node_name in graph.get_callers(focal, depth) for focal in focal_nodes
                )
                is_downstream = any(
                    node_name in graph.get_callees(focal, depth) for focal in focal_nodes
                )

                if is_upstream:
                    lines.append(f'    {node_id}["{display_name}()"]:::upstream')
                elif is_downstream:
                    lines.append(f'    {node_id}["{display_name}()"]:::downstream')
                else:
                    lines.append(f'    {node_id}["{display_name}()"]')

        # Add edges
        edges = graph.get_edges()
        for from_sym, to_sym in edges:
            if from_sym not in nodes_to_include or to_sym not in nodes_to_include:
                continue

            from_id = self._sanitize_id(from_sym)
            to_id = self._sanitize_id(to_sym)
            lines.append(f"    {from_id} --> {to_id}")

        # Add styling definitions
        lines.append("    classDef focal stroke:#f00,stroke-width:4px")
        lines.append("    classDef upstream stroke:#0099ff,stroke-width:2px")
        lines.append("    classDef downstream stroke:#00cc00,stroke-width:2px")

        # Add legend
        lines.append('    subgraph legend["Legend"]')
        lines.append('        focal_ex["Focal Symbol"]:::focal')
        lines.append('        upstream_ex["Upstream (Callers)"]:::upstream')
        lines.append('        downstream_ex["Downstream (Callees)"]:::downstream')
        lines.append("    end")

        return "\n".join(lines)

    def _sanitize_id(self, symbol_name: str) -> str:
        """Convert a symbol name to a valid Mermaid identifier.

        Mermaid requires identifiers to be alphanumeric with underscores.
        Converts dots and other special characters to underscores.

        Args:
            symbol_name: Symbol name to sanitize.

        Returns:
            Safe Mermaid identifier.
        """
        # Replace non-alphanumeric characters with underscores
        safe_id = ""
        for char in symbol_name:
            if char.isalnum() or char == "_":
                safe_id += char
            else:
                safe_id += "_"

        # Ensure it doesn't start with a number
        if safe_id and safe_id[0].isdigit():
            safe_id = "_" + safe_id

        return safe_id
