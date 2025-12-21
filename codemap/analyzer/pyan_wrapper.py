"""Wrapper around pyan3 for code analysis."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from codemap.logging_config import get_logger

if TYPE_CHECKING:
    pass

logger = get_logger(__name__)


@dataclass
class SymbolMetadata:
    """Metadata for a symbol extracted from AST."""

    qualified_name: str
    kind: str  # "module", "class", "function", "method"
    file: Path
    line: int
    docstring: str | None = None


@dataclass
class CallGraph:
    """Result of code analysis."""

    nodes: dict[str, SymbolMetadata] = field(default_factory=dict)
    edges: list[tuple[str, str]] = field(default_factory=list)
    files_analyzed: list[Path] = field(default_factory=list)


class PyanAnalyzer:
    """Wrapper around pyan3 CallGraphVisitor for AST analysis."""

    def __init__(self, exclude_patterns: list[str] | None = None) -> None:
        """Initialize the analyzer.

        Args:
            exclude_patterns: Patterns to exclude from analysis.
        """
        self.exclude_patterns = exclude_patterns or ["__pycache__", ".venv"]

    def analyze_files(
        self,
        file_paths: list[Path],
    ) -> CallGraph:
        """Analyze Python files and extract call graph.

        Args:
            file_paths: List of Python files to analyze.

        Returns:
            CallGraph containing nodes and edges with metadata.
        """
        # Filter files by exclusion patterns
        filtered_files = self._filter_files(file_paths)

        if not filtered_files:
            logger.warning("No files to analyze after filtering")
            return CallGraph()

        try:
            logger.debug(
                "Analyzing %d Python files",
                len(filtered_files),
            )
            # Try to import pyan here to allow graceful degradation
            try:
                from pyan.anutils import Flavor

                file_strings = [str(f.absolute()) for f in filtered_files]
                visitor = self._create_visitor(file_strings)

                # Extract graph information with metadata
                nodes: dict[str, SymbolMetadata] = {}
                edges: list[tuple[str, str]] = []

                # Extract nodes from pyan's nodes dict with metadata
                # pyan stores: nodes[key] = [<Node kind:name>, ...]
                if hasattr(visitor, "nodes"):
                    for key, node_list in visitor.nodes.items():
                        for node in node_list:
                            # Only include function, class, method, and module nodes
                            if node.flavor in (
                                Flavor.FUNCTION,
                                Flavor.CLASS,
                                Flavor.METHOD,
                                Flavor.MODULE,
                            ):
                                qualified_name = node.get_name()
                                # Get kind from flavor
                                kind_str = self._flavor_to_kind(node.flavor)

                                # Get file and line number
                                file_path = Path(node.filename)
                                line_num = 1  # Default for module
                                if node.ast_node and hasattr(node.ast_node, "lineno"):
                                    line_num = node.ast_node.lineno

                                # Get docstring if available
                                docstring = None
                                if node.ast_node and hasattr(node.ast_node, "body"):
                                    import ast

                                    docstring = ast.get_docstring(node.ast_node)

                                metadata = SymbolMetadata(
                                    qualified_name=qualified_name,
                                    kind=kind_str,
                                    file=file_path,
                                    line=line_num,
                                    docstring=docstring,
                                )
                                nodes[qualified_name] = metadata

                # Extract edges from defines_edges (function/method calls)
                if hasattr(visitor, "defines_edges"):
                    for from_node, to_nodes_set in visitor.defines_edges.items():
                        from_str = from_node.get_name()

                        # Extract all nodes this one defines
                        for to_node in to_nodes_set:
                            to_str = to_node.get_name()

                            # Filter out non-code nodes (builtins, etc.)
                            if not to_str.startswith("*"):
                                edges.append((from_str, to_str))

                return CallGraph(
                    nodes=nodes,
                    edges=edges,
                    files_analyzed=filtered_files,
                )
            except ImportError:
                logger.warning("pyan3 not available, returning empty graph")
                return CallGraph(files_analyzed=filtered_files)
        except Exception as exception:
            logger.error(
                "Failed during code analysis: %s",
                exception,
            )
            return CallGraph(files_analyzed=filtered_files)

    def _flavor_to_kind(self, flavor: Any) -> str:
        """Convert pyan Flavor to symbol kind string.

        Args:
            flavor: pyan Flavor enum value.

        Returns:
            Symbol kind string: "module", "class", "function", or "method".
        """
        flavor_str = str(flavor).lower()
        if "module" in flavor_str:
            return "module"
        elif "class" in flavor_str:
            return "class"
        elif "method" in flavor_str:
            return "method"
        elif "function" in flavor_str:
            return "function"
        return "function"  # Default fallback

    def _filter_files(
        self,
        file_paths: list[Path],
    ) -> list[Path]:
        """Filter files based on exclusion patterns.

        Args:
            file_paths: List of files to filter.

        Returns:
            Filtered list of files to analyze.
        """
        filtered = []
        for file_path in file_paths:
            if self._should_exclude(file_path):
                logger.debug("Excluding file: %s", file_path)
                continue
            filtered.append(file_path)
        return filtered

    def _should_exclude(self, file_path: Path) -> bool:
        """Check if a file should be excluded.

        Args:
            file_path: Path to check.

        Returns:
            True if file should be excluded, False otherwise.
        """
        path_str = str(file_path)
        for pattern in self.exclude_patterns:
            if pattern in path_str:
                return True
        return False

    def _create_visitor(self, file_strings: list[str]) -> Any:
        """Create a CallGraphVisitor with graceful handling of comprehension scopes.

        Wraps the creation of CallGraphVisitor to gracefully handle unknown scope
        types (listcomp, dictcomp, setcomp, genexpr) that pyan3 creates but may
        not properly register. These scopes are treated as part of their parent
        function scope.

        Args:
            file_strings: List of absolute file paths to analyze.

        Returns:
            CallGraphVisitor instance with scope error handling.

        Raises:
            ImportError: If pyan3 is not available.
        """
        from pyan import CallGraphVisitor

        try:
            visitor = CallGraphVisitor(file_strings, logger=logger)
            return visitor
        except ValueError as value_error:
            # If we get a ValueError about unknown scopes, patch and try again
            if "Unknown scope" in str(value_error):
                logger.warning(
                    "pyan3 encountered unknown scope error while analyzing: %s",
                    value_error,
                )
                # Try again with a patched CallGraphVisitor that ignores these errors
                return self._create_visitor_with_scope_patching(file_strings)
            raise

    def _create_visitor_with_scope_patching(self, file_strings: list[str]) -> Any:
        """Create CallGraphVisitor with monkey-patched scope error handling.

        As a fallback when the logger approach doesn't prevent the error,
        this patches the CallGraphVisitor's scope lookup to gracefully skip
        unknown comprehension scopes.

        Args:
            file_strings: List of absolute file paths to analyze.

        Returns:
            CallGraphVisitor instance with patched scope handling.

        Raises:
            ImportError: If pyan3 is not available.
        """
        from pyan import CallGraphVisitor, anutils

        # Store the original methods
        original_context_enter = anutils.ExecuteInInnerScope.__enter__
        original_context_exit = anutils.ExecuteInInnerScope.__exit__

        # Track which scopes we skipped to handle exit properly
        skipped_scopes: set[int] = set()

        def patched_enter(scope_context_self):  # type: ignore
            """Patched __enter__ that handles unknown scopes gracefully.

            Args:
                scope_context_self: The ExecuteInInnerScope instance.

            Returns:
                The ExecuteInInnerScope instance (self).

            Raises:
                ValueError: If scope is unknown but not a comprehension type.
            """
            analyzer = scope_context_self.analyzer
            scopename = scope_context_self.scopename

            analyzer.name_stack.append(scopename)
            inner_ns = analyzer.get_node_of_current_namespace().get_name()

            # Check if this is an unknown comprehension scope
            scope_types = ["listcomp", "dictcomp", "setcomp", "genexpr"]
            is_comprehension = any(scope_type in inner_ns for scope_type in scope_types)

            if inner_ns not in analyzer.scopes:
                if is_comprehension:
                    # Log warning and skip this scope
                    logger.warning(
                        "Skipping unknown comprehension scope (treating as "
                        "part of parent scope): %s",
                        inner_ns,
                    )
                    # Mark this scope as skipped so __exit__ knows not to pop stacks
                    skipped_scopes.add(id(scope_context_self))
                    # Don't push scope_stack, but do push context_stack for tracking
                    analyzer.context_stack.append(scopename)
                    return scope_context_self

                # For non-comprehension unknown scopes, raise the original error
                analyzer.name_stack.pop()
                raise ValueError("Unknown scope '%s'" % (inner_ns))

            # Normal case: scope exists, proceed as usual
            analyzer.scope_stack.append(analyzer.scopes[inner_ns])
            analyzer.context_stack.append(scopename)
            return scope_context_self

        def patched_exit(scope_context_self, errtype, errvalue, traceback):  # type: ignore
            """Patched __exit__ that handles skipped scopes properly.

            Args:
                scope_context_self: The ExecuteInInnerScope instance.
                errtype: Exception type or None.
                errvalue: Exception value or None.
                traceback: Traceback object or None.
            """
            analyzer = scope_context_self.analyzer
            scopename = scope_context_self.scopename

            # Check if this scope was skipped
            scope_id = id(scope_context_self)
            was_skipped = scope_id in skipped_scopes
            if was_skipped:
                skipped_scopes.discard(scope_id)

            # Only pop from stacks if we didn't skip this scope
            if not was_skipped:
                analyzer.scope_stack.pop()

            # Always pop context and name
            analyzer.context_stack.pop()
            analyzer.name_stack.pop()

            # For non-skipped scopes, add the defines edge (original behavior)
            if not was_skipped:
                from pyan.anutils import Flavor

                from_node = analyzer.get_node_of_current_namespace()
                ns = from_node.get_name()
                to_node = analyzer.get_node(ns, scopename, None, flavor=Flavor.NAMESPACE)
                if analyzer.add_defines_edge(from_node, to_node):
                    analyzer.logger.info("Def from %s to %s %s" % (from_node, scopename, to_node))
                analyzer.last_value = to_node

        # Monkey-patch both methods
        anutils.ExecuteInInnerScope.__enter__ = patched_enter
        anutils.ExecuteInInnerScope.__exit__ = patched_exit

        try:
            visitor = CallGraphVisitor(file_strings, logger=logger)
            return visitor
        finally:
            # Restore the original methods
            anutils.ExecuteInInnerScope.__enter__ = original_context_enter
            anutils.ExecuteInInnerScope.__exit__ = original_context_exit
