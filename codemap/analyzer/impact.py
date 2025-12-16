"""Impact analysis for code changes."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

from codemap.logging_config import get_logger

if TYPE_CHECKING:
    from codemap.analyzer.graph import DependencyGraph

logger = get_logger(__name__)


@dataclass
class ImpactReport:
    """Report of impact analysis for changed symbols."""

    # Symbols directly or transitively affected by the changes
    affected_symbols: list[str] = field(default_factory=list)

    # Unique files containing affected symbols
    affected_files: list[Path] = field(default_factory=list)

    # Risk score from 0-100 based on impact severity
    # Factors: count of affected symbols, depth of impact, test coverage
    risk_score: int = 0

    # Suggested test files to run based on affected symbols
    suggested_tests: list[Path] = field(default_factory=list)

    # Breakdown of direct vs transitive impacts
    direct_impacts: list[str] = field(default_factory=list)
    transitive_impacts: list[str] = field(default_factory=list)


class ImpactAnalyzer:
    """Analyzes the impact of changes to code symbols."""

    def __init__(self, graph: DependencyGraph) -> None:
        """Initialize analyzer with dependency graph.

        Args:
            graph: DependencyGraph to analyze.
        """
        self._graph = graph

    def analyze_impact(
        self,
        symbols: list[str],
        max_depth: int | None = None,
    ) -> ImpactReport:
        """Analyze impact of changes to the specified symbols.

        Args:
            symbols: List of symbols that are being changed.
            max_depth: Maximum depth to traverse (None = unlimited).

        Returns:
            ImpactReport with affected symbols and risk assessment.
        """
        logger.info(
            "Analyzing impact for %d symbols with max_depth=%s",
            len(symbols),
            max_depth,
        )

        # Get all affected symbols
        # When a symbol changes, it affects things that CALL it (use it)
        # In the graph, if "a" has edge to "b", it means "a" calls "b"
        # So things that CALL our changed symbol are the ones affected
        direct_impacts = set()
        transitive_impacts = set()

        for symbol in symbols:
            if not self._graph.has_node(symbol):
                logger.warning("Symbol not found in graph: %s", symbol)
                continue

            # Get all symbols that call this one (direct impact)
            callers = self._graph.get_callers(symbol)

            for caller in callers:
                direct_impacts.add(caller)

            # Get transitive impacts with depth limit
            for caller in callers:
                # Get things that call the caller
                transitive = self._graph.get_callers(
                    caller,
                    depth=max_depth - 1 if max_depth else None,
                )
                for trans in transitive:
                    if trans not in direct_impacts:
                        transitive_impacts.add(trans)

        all_affected = direct_impacts | transitive_impacts

        # Get affected files
        affected_files = set()
        for symbol_name in all_affected:
            # Extract file from node attributes if available
            if self._graph.has_node(symbol_name):
                affected_files.add(Path(symbol_name.split(".")[0]))

        # Calculate risk score
        risk_score = self._calculate_risk_score(
            affected=list(all_affected),
            depth=len(transitive_impacts),
            has_tests=self._has_tests(list(all_affected)),
        )

        # Suggest tests
        suggested_tests = self.suggest_test_files(list(all_affected))

        return ImpactReport(
            affected_symbols=sorted(list(all_affected)),
            affected_files=sorted(list(affected_files)),
            risk_score=risk_score,
            suggested_tests=suggested_tests,
            direct_impacts=sorted(list(direct_impacts)),
            transitive_impacts=sorted(list(transitive_impacts)),
        )

    def suggest_test_files(self, affected: list[str]) -> list[Path]:
        """Suggest test files to run based on affected symbols.

        Args:
            affected: List of affected symbols.

        Returns:
            List of suggested test file paths.
        """
        suggested = set()
        for symbol in affected:
            # Heuristic: suggest test files matching module names
            parts = symbol.split(".")
            if len(parts) > 0:
                module = parts[0]
                suggested.add(Path(f"tests/test_{module}.py"))
                suggested.add(Path(f"tests/{module}/test_*.py"))

        return sorted(list(suggested))

    def _calculate_risk_score(
        self,
        affected: list[str],
        depth: int,
        has_tests: bool,
    ) -> int:
        """Calculate risk score (0-100) based on impact factors.

        Args:
            affected: List of affected symbols.
            depth: Depth of transitive impacts.
            has_tests: Whether tests are present.

        Returns:
            Risk score from 0-100.
        """
        # Base score from number of affected symbols
        num_affected = len(affected)
        base_score = min(50, num_affected * 5)

        # Add points for depth
        depth_score = min(30, depth * 2)

        # Reduce score if tests exist
        test_reduction = 10 if has_tests else 0

        score = base_score + depth_score - test_reduction
        return max(0, min(100, score))

    @staticmethod
    def _has_tests(affected: list[str]) -> bool:
        """Check if affected symbols have tests.

        Args:
            affected: List of affected symbols.

        Returns:
            True if tests are likely present.
        """
        # Simple heuristic: check if any symbol mentions "test"
        return any("test" in sym.lower() for sym in affected)
