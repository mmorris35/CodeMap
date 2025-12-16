"""Parser for DEVELOPMENT_PLAN.md files."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from codemap.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class Deliverable:
    """A deliverable item from a subtask."""

    text: str
    completed: bool = False


@dataclass
class Subtask:
    """A subtask from the development plan (X.Y.Z format)."""

    id: str  # e.g., "1.2.3"
    title: str
    deliverables: list[Deliverable] = field(default_factory=list)
    files_to_create: list[str] = field(default_factory=list)
    files_to_modify: list[str] = field(default_factory=list)
    completed: bool = False


@dataclass
class Task:
    """A task containing multiple subtasks (X.Y format)."""

    id: str  # e.g., "1.2"
    title: str
    subtasks: list[Subtask] = field(default_factory=list)


@dataclass
class Phase:
    """A phase containing multiple tasks."""

    number: int  # e.g., 0, 1, 2
    title: str
    tasks: list[Task] = field(default_factory=list)


@dataclass
class DevPlan:
    """Parsed development plan."""

    project_name: str
    phases: list[Phase] = field(default_factory=list)

    def get_subtask(self, subtask_id: str) -> Optional[Subtask]:
        """Get a subtask by its ID (e.g., '1.2.3').

        Args:
            subtask_id: The subtask ID to find.

        Returns:
            Subtask if found, None otherwise.
        """
        for subtask in self.get_all_subtasks():
            if subtask.id == subtask_id:
                return subtask
        return None

    def get_all_subtasks(self) -> list[Subtask]:
        """Get all subtasks in order.

        Returns:
            List of all subtasks from all phases and tasks.
        """
        subtasks = []
        for phase in self.phases:
            for task in phase.tasks:
                subtasks.extend(task.subtasks)
        return subtasks


class DevPlanParser:
    """Parser for DEVELOPMENT_PLAN.md files."""

    # Regex patterns for parsing
    SUBTASK_ID_PATTERN = re.compile(r"\*\*Subtask (\d+\.\d+\.\d+):")
    TASK_ID_PATTERN = re.compile(r"### Task (\d+\.\d+):")
    PHASE_PATTERN = re.compile(r"## Phase (\d+):")
    CHECKBOX_PATTERN = re.compile(r"- \[([ xX])\] (.+)")
    FILE_SECTION_PATTERN = re.compile(r"\*\*Files to (Create|Modify)\*\*:")

    def parse(self, path: Path) -> DevPlan:
        """Parse a DEVELOPMENT_PLAN.md file.

        Args:
            path: Path to DEVELOPMENT_PLAN.md file.

        Returns:
            Parsed DevPlan object.

        Raises:
            FileNotFoundError: If file does not exist.
        """
        logger.debug("Parsing DEVELOPMENT_PLAN from %s", path)

        if not path.exists():
            raise FileNotFoundError(f"DEVELOPMENT_PLAN not found: {path}")

        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        # Extract project name from first heading
        lines = content.split("\n")
        project_name = "CodeMap"  # Default
        for line in lines:
            if line.startswith("# "):
                project_name = line.replace("# ", "").strip()
                break

        dev_plan = DevPlan(project_name=project_name)

        # Split into sections for phases and tasks
        current_phase: Optional[Phase] = None
        current_task: Optional[Task] = None
        current_subtask: Optional[Subtask] = None
        current_section: Optional[str] = None
        section_buffer: list[str] = []

        for line in lines:
            # Check for phase heading
            phase_match = self.PHASE_PATTERN.match(line)
            if phase_match:
                phase_num = int(phase_match.group(1))
                # Extract phase title
                title = line.replace(f"## Phase {phase_num}:", "").strip()
                current_phase = Phase(number=phase_num, title=title)
                dev_plan.phases.append(current_phase)
                current_task = None
                current_subtask = None
                continue

            # Check for task heading
            task_match = self.TASK_ID_PATTERN.match(line)
            if task_match and current_phase:
                task_id = task_match.group(1)
                # Extract task title
                title = line.replace(f"### Task {task_id}:", "").strip()
                current_task = Task(id=task_id, title=title)
                current_phase.tasks.append(current_task)
                current_subtask = None
                continue

            # Check for subtask heading
            subtask_match = self.SUBTASK_ID_PATTERN.match(line)
            if subtask_match and current_task:
                subtask_id = subtask_match.group(1)
                # Extract title from rest of line
                title = line.replace(f"**Subtask {subtask_id}:", "").replace("**", "").strip()
                current_subtask = Subtask(id=subtask_id, title=title)
                current_task.subtasks.append(current_subtask)
                current_section = None
                section_buffer = []
                continue

            # Check for section headers within subtask
            if current_subtask:
                if "**Deliverables**" in line:
                    # Process previous section first
                    if current_section and section_buffer:
                        self._process_section(
                            current_subtask,
                            current_section,
                            section_buffer,
                        )
                    current_section = "deliverables"
                    section_buffer = []
                    continue
                elif "**Files to Create**" in line:
                    # Process previous section first
                    if current_section and section_buffer:
                        self._process_section(
                            current_subtask,
                            current_section,
                            section_buffer,
                        )
                    current_section = "files_to_create"
                    section_buffer = []
                    continue
                elif "**Files to Modify**" in line:
                    # Process previous section first
                    if current_section and section_buffer:
                        self._process_section(
                            current_subtask,
                            current_section,
                            section_buffer,
                        )
                    current_section = "files_to_modify"
                    section_buffer = []
                    continue
                elif (
                    line.startswith("**")
                    and "**:" in line
                    or line.startswith("##")
                    or line.startswith("---")
                ):
                    # Hit a new section/subsection - process and reset
                    if current_section and section_buffer:
                        self._process_section(
                            current_subtask,
                            current_section,
                            section_buffer,
                        )
                    current_section = None
                    section_buffer = []
                    continue

                # Add to current section buffer
                if current_section:
                    section_buffer.append(line)

        # Process final section if any
        if current_subtask and current_section and section_buffer:
            self._process_section(current_subtask, current_section, section_buffer)

        logger.info("Parsed DEVELOPMENT_PLAN with %d phases", len(dev_plan.phases))
        return dev_plan

    def _process_section(
        self,
        subtask: Subtask,
        section: str,
        lines: list[str],
    ) -> None:
        """Process a section of a subtask.

        Args:
            subtask: Subtask to update.
            section: Section type (deliverables, files_to_create, files_to_modify).
            lines: Lines in the section.
        """
        if section == "deliverables":
            for line in lines:
                match = self.CHECKBOX_PATTERN.match(line)
                if match:
                    checked = match.group(1).lower() == "x"
                    text = match.group(2)
                    subtask.deliverables.append(Deliverable(text=text, completed=checked))

        elif section == "files_to_create":
            for line in lines:
                # Extract file paths (usually after dashes)
                if line.strip().startswith("- "):
                    file_path = line.replace("- ", "").strip()
                    # Remove backticks if present
                    file_path = file_path.strip("`")
                    # Remove any trailing descriptions after space
                    if " - " in file_path:
                        file_path = file_path.split(" - ")[0].strip()
                    # Skip placeholder entries
                    if file_path and file_path.lower() != "none":
                        if file_path not in subtask.files_to_create:
                            subtask.files_to_create.append(file_path)

        elif section == "files_to_modify":
            for line in lines:
                # Extract file paths (usually after dashes)
                if line.strip().startswith("- "):
                    file_path = line.replace("- ", "").strip()
                    # Remove backticks if present
                    file_path = file_path.strip("`")
                    # Remove any trailing descriptions after space
                    if " - " in file_path:
                        file_path = file_path.split(" - ")[0].strip()
                    # Skip placeholder entries
                    if file_path and file_path.lower() != "none":
                        if file_path not in subtask.files_to_modify:
                            subtask.files_to_modify.append(file_path)
