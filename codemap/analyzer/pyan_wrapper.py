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
class CallGraph:
    """Result of code analysis."""

    nodes: dict[str, Any] = field(default_factory=dict)
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
            CallGraph containing nodes and edges.
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
                from pyan import CallGraphVisitor

                file_strings = [str(f.absolute()) for f in filtered_files]
                visitor = CallGraphVisitor(file_strings, logger=logger)

                # Extract graph information
                nodes = {}
                edges = []

                # Pyan stores results in the visitor object
                if hasattr(visitor, "graph"):
                    graph = visitor.graph
                    for node in graph.nodes():
                        nodes[node] = {"node": node}
                    for edge_from, edge_to in graph.edges():
                        edges.append((edge_from, edge_to))

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
