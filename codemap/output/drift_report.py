"""DRIFT_REPORT.md generator for architecture drift detection."""

from __future__ import annotations

from typing import TYPE_CHECKING

from codemap.logging_config import get_logger

if TYPE_CHECKING:
    from codemap.output.linker import PlanCodeMap
    from codemap.output.schemas import CodeMapSchema

logger = get_logger(__name__)


class DriftReportGenerator:
    """Generates DRIFT_REPORT.md showing planned vs implemented code."""

    def generate(self, plan_code_map: PlanCodeMap, code_map: CodeMapSchema) -> str:
        """Generate drift report as Markdown.

        Args:
            plan_code_map: Linked plan and code.
            code_map: CODE_MAP.json data.

        Returns:
            Markdown formatted drift report.
        """
        logger.debug("Generating drift report")

        lines: list[str] = []

        # Header
        lines.append("# Architecture Drift Report")
        lines.append("")

        # Extract data
        symbols_list: list[dict[str, object]] = code_map.get("symbols", [])  # type: ignore[assignment]
        all_symbols = {
            str(s.get("qualified_name", "")): s for s in symbols_list if s.get("qualified_name")
        }
        planned_symbols = set()
        for symbols in plan_code_map.task_to_symbols.values():
            planned_symbols.update(symbols)

        implemented_symbols = set(all_symbols.keys())
        unimplemented = planned_symbols - implemented_symbols
        unplanned = implemented_symbols - planned_symbols

        # Summary
        lines.append("## Summary")
        lines.append("")
        lines.append(f"- **Total Planned Symbols**: {len(planned_symbols)}")
        lines.append(f"- **Total Implemented Symbols**: {len(implemented_symbols)}")
        lines.append(f"- **Planned but Not Implemented**: {len(unimplemented)}")
        lines.append(f"- **Implemented but Not Planned**: {len(unplanned)}")
        lines.append("")

        # Drift status
        drift_score = (len(unimplemented) + len(unplanned)) / max(len(planned_symbols), 1)
        if drift_score == 0:
            lines.append("**Status**: ✓ No drift detected")
        elif drift_score < 0.1:
            lines.append("**Status**: ⚠ Minor drift (< 10%)")
        elif drift_score < 0.3:
            lines.append("**Status**: ⚠ Moderate drift (10-30%)")
        else:
            lines.append("**Status**: ✗ Significant drift (> 30%)")

        lines.append("")

        # Planned but not implemented
        if unimplemented:
            lines.append("## Planned But Not Implemented")
            lines.append("")
            lines.append("| Symbol | Task Links |")
            lines.append("|--------|-----------|")

            for symbol in sorted(unimplemented):
                tasks = plan_code_map.get_tasks_for_symbol(symbol)
                task_str = ", ".join(sorted(tasks)) if tasks else ""
                lines.append(f"| `{symbol}` | {task_str} |")

            lines.append("")

        # Implemented but not planned
        if unplanned:
            lines.append("## Implemented But Not Planned")
            lines.append("")
            lines.append("| Symbol | File | Line | Risk |")
            lines.append("|--------|------|------|------|")

            for symbol in sorted(unplanned):
                sym_data = all_symbols.get(symbol, {})
                file_path_val: object = sym_data.get("file", "")
                file_path = str(file_path_val) if file_path_val else ""
                line_no_val: object = sym_data.get("line", 0)
                line_no = int(line_no_val) if isinstance(line_no_val, int) else 0

                # Risk assessment
                if "_test" in file_path or "test_" in file_path:
                    risk = "Low"
                elif "_internal" in symbol or "_private" in symbol:
                    risk = "Low"
                else:
                    risk = "High"

                lines.append(f"| `{symbol}` | {file_path} | {line_no} | {risk} |")

            lines.append("")

        # Modified files
        modified_files = set()
        for symbol in implemented_symbols:
            sym_data = all_symbols.get(symbol, {})
            file_path_obj: object = sym_data.get("file", "")
            file_path = str(file_path_obj) if file_path_obj else ""
            if file_path:
                modified_files.add(file_path)

        if modified_files:
            lines.append("## Modified Files")
            lines.append("")
            lines.append("| File | Symbol Count |")
            lines.append("|------|--------------|")

            file_symbol_count: dict[str, int] = {}
            for symbol in implemented_symbols:
                sym_data = all_symbols.get(symbol, {})
                file_obj: object = sym_data.get("file", "")
                file_name = str(file_obj) if file_obj else ""
                if file_name:
                    file_symbol_count[file_name] = file_symbol_count.get(file_name, 0) + 1

            for file_path in sorted(file_symbol_count.keys()):
                count = file_symbol_count[file_path]
                lines.append(f"| {file_path} | {count} |")

            lines.append("")

        # Recommendations
        lines.append("## Recommendations")
        lines.append("")

        if unimplemented:
            lines.append(
                f"- **{len(unimplemented)} symbols** planned but not implemented. "
                "Review if these are still needed or update the plan."
            )

        if unplanned:
            lines.append(
                f"- **{len(unplanned)} symbols** implemented but not planned. "
                "Consider updating the plan or removing unplanned code."
            )

        if drift_score > 0.2:
            lines.append(
                "- **Significant drift** detected. Consider re-synchronizing "
                "the development plan with the actual codebase."
            )

        if not unimplemented and not unplanned:
            lines.append("- **Code matches plan perfectly!** No action required.")

        lines.append("")

        report = "\n".join(lines)
        logger.info("Generated drift report")

        return report
