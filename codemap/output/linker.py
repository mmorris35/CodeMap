"""Linker between development plan and code symbols."""

from __future__ import annotations

from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import TYPE_CHECKING

from codemap.logging_config import get_logger

if TYPE_CHECKING:
    from codemap.output.devplan_parser import DevPlan
    from codemap.output.schemas import CodeMapSchema

logger = get_logger(__name__)


@dataclass
class PlanCodeMap:
    """Bidirectional mapping between plan items and code symbols."""

    task_to_symbols: dict[str, list[str]] = field(default_factory=dict)
    symbol_to_tasks: dict[str, list[str]] = field(default_factory=dict)
    confidence_scores: dict[tuple[str, str], float] = field(default_factory=dict)

    def add_link(self, task_id: str, symbol: str, confidence: float = 1.0) -> None:
        """Add a link between task and symbol.

        Args:
            task_id: Task ID (e.g., "1.2.3").
            symbol: Qualified symbol name.
            confidence: Confidence score (0.0-1.0).
        """
        if task_id not in self.task_to_symbols:
            self.task_to_symbols[task_id] = []
        if symbol not in self.task_to_symbols[task_id]:
            self.task_to_symbols[task_id].append(symbol)

        if symbol not in self.symbol_to_tasks:
            self.symbol_to_tasks[symbol] = []
        if task_id not in self.symbol_to_tasks[symbol]:
            self.symbol_to_tasks[symbol].append(task_id)

        self.confidence_scores[(task_id, symbol)] = confidence

    def get_symbols_for_task(self, task_id: str) -> list[str]:
        """Get symbols linked to a task.

        Args:
            task_id: Task ID.

        Returns:
            List of linked symbols.
        """
        return self.task_to_symbols.get(task_id, [])

    def get_tasks_for_symbol(self, symbol: str) -> list[str]:
        """Get tasks linked to a symbol.

        Args:
            symbol: Qualified symbol name.

        Returns:
            List of linked task IDs.
        """
        return self.symbol_to_tasks.get(symbol, [])

    def get_confidence(self, task_id: str, symbol: str) -> float:
        """Get confidence score for a link.

        Args:
            task_id: Task ID.
            symbol: Qualified symbol name.

        Returns:
            Confidence score (0.0-1.0).
        """
        return self.confidence_scores.get((task_id, symbol), 0.0)


class PlanCodeLinker:
    """Links development plan items to code symbols."""

    def __init__(self, threshold: float = 0.6) -> None:
        """Initialize linker.

        Args:
            threshold: Minimum confidence for automatic linking.
        """
        self.threshold = threshold

    def link(self, devplan: DevPlan, code_map: CodeMapSchema) -> PlanCodeMap:
        """Link devplan to code map.

        Args:
            devplan: Parsed development plan.
            code_map: CODE_MAP.json data.

        Returns:
            PlanCodeMap with bidirectional links.
        """
        logger.debug("Linking development plan to code map")

        plan_code_map = PlanCodeMap()
        symbols: list[dict[str, object]] = code_map.get("symbols", [])  # type: ignore[assignment]

        for subtask in devplan.get_all_subtasks():
            # Try to match based on files_to_create
            for file_path in subtask.files_to_create:
                matching_symbols = [
                    s for s in symbols if str(s.get("file", "")).endswith(file_path.split("/")[-1])
                ]
                for symbol in matching_symbols:
                    symbol_name = str(symbol.get("qualified_name", ""))
                    if symbol_name:
                        plan_code_map.add_link(subtask.id, symbol_name, confidence=0.8)

            # Try to match based on deliverable text mentioning symbols
            for deliverable in subtask.deliverables:
                for symbol in symbols:
                    symbol_name = str(symbol.get("qualified_name", ""))
                    symbol_short = symbol_name.split(".")[-1] if symbol_name else ""

                    # Fuzzy match in deliverable text
                    if symbol_short and symbol_short in deliverable.text.lower():
                        confidence = self._calculate_confidence(deliverable.text, symbol_short)
                        if confidence >= self.threshold:
                            plan_code_map.add_link(subtask.id, symbol_name, confidence)

        logger.info(
            "Created %d task-to-symbol links",
            sum(len(v) for v in plan_code_map.task_to_symbols.values()),
        )

        return plan_code_map

    def _calculate_confidence(self, text: str, symbol: str) -> float:
        """Calculate confidence score for a match.

        Args:
            text: Text containing potential match.
            symbol: Symbol to match.

        Returns:
            Confidence score (0.0-1.0).
        """
        ratio = SequenceMatcher(None, text.lower(), symbol.lower()).ratio()
        return min(ratio, 1.0)
