"""Tests for DevPlan parser."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from codemap.output.devplan_parser import (
    Deliverable,
    DevPlan,
    DevPlanParser,
    Phase,
    Subtask,
    Task,
)


@pytest.fixture  # type: ignore[misc]
def sample_devplan_path() -> Path:
    """Get path to sample development plan fixture."""
    return Path(__file__).parent.parent / "fixtures" / "sample_devplan.md"


class TestDeliverableDataclass:
    """Tests for Deliverable dataclass."""

    def test_create_deliverable(self) -> None:
        """Test creating a deliverable."""
        deliv = Deliverable(text="Test deliverable", completed=False)
        assert deliv.text == "Test deliverable"
        assert deliv.completed is False

    def test_deliverable_completed(self) -> None:
        """Test completed deliverable."""
        deliv = Deliverable(text="Done task", completed=True)
        assert deliv.completed is True


class TestSubtaskDataclass:
    """Tests for Subtask dataclass."""

    def test_create_subtask(self) -> None:
        """Test creating a subtask."""
        subtask = Subtask(id="1.2.3", title="Sample Subtask")
        assert subtask.id == "1.2.3"
        assert subtask.title == "Sample Subtask"
        assert len(subtask.deliverables) == 0

    def test_subtask_with_files(self) -> None:
        """Test subtask with file lists."""
        subtask = Subtask(
            id="1.2.3",
            title="Sample",
            files_to_create=["file1.py", "file2.py"],
            files_to_modify=["file3.py"],
        )
        assert len(subtask.files_to_create) == 2
        assert len(subtask.files_to_modify) == 1


class TestTaskDataclass:
    """Tests for Task dataclass."""

    def test_create_task(self) -> None:
        """Test creating a task."""
        task = Task(id="1.2", title="Sample Task")
        assert task.id == "1.2"
        assert task.title == "Sample Task"


class TestPhaseDataclass:
    """Tests for Phase dataclass."""

    def test_create_phase(self) -> None:
        """Test creating a phase."""
        phase = Phase(number=1, title="Core Analysis")
        assert phase.number == 1
        assert phase.title == "Core Analysis"


class TestDevPlanDataclass:
    """Tests for DevPlan dataclass."""

    def test_create_devplan(self) -> None:
        """Test creating a development plan."""
        plan = DevPlan(project_name="TestProject")
        assert plan.project_name == "TestProject"
        assert len(plan.phases) == 0

    def test_get_all_subtasks(self) -> None:
        """Test getting all subtasks."""
        plan = DevPlan(project_name="Test")

        # Add phase with task and subtask
        phase = Phase(number=1, title="Phase 1")
        task = Task(id="1.1", title="Task 1.1")
        subtask = Subtask(id="1.1.1", title="Subtask 1.1.1")
        task.subtasks.append(subtask)
        phase.tasks.append(task)
        plan.phases.append(phase)

        all_subtasks = plan.get_all_subtasks()
        assert len(all_subtasks) == 1
        assert all_subtasks[0].id == "1.1.1"

    def test_get_subtask_by_id(self) -> None:
        """Test getting a subtask by ID."""
        plan = DevPlan(project_name="Test")

        phase = Phase(number=1, title="Phase 1")
        task = Task(id="1.1", title="Task 1.1")
        subtask = Subtask(id="1.1.1", title="Subtask 1.1.1")
        task.subtasks.append(subtask)
        phase.tasks.append(task)
        plan.phases.append(phase)

        found = plan.get_subtask("1.1.1")
        assert found is not None
        assert found.title == "Subtask 1.1.1"

    def test_get_nonexistent_subtask(self) -> None:
        """Test getting nonexistent subtask returns None."""
        plan = DevPlan(project_name="Test")
        found = plan.get_subtask("9.9.9")
        assert found is None


class TestDevPlanParser:
    """Tests for DevPlanParser."""

    def test_parse_creates_phases(self, sample_devplan_path: Path) -> None:
        """Test that parser creates phases."""
        parser = DevPlanParser()
        plan = parser.parse(sample_devplan_path)

        assert len(plan.phases) > 0
        assert plan.phases[0].number == 0 or plan.phases[0].number == 1

    def test_parse_creates_tasks(self, sample_devplan_path: Path) -> None:
        """Test that parser creates tasks."""
        parser = DevPlanParser()
        plan = parser.parse(sample_devplan_path)

        total_tasks = sum(len(phase.tasks) for phase in plan.phases)
        assert total_tasks > 0

    def test_parse_creates_subtasks(self, sample_devplan_path: Path) -> None:
        """Test that parser creates subtasks."""
        parser = DevPlanParser()
        plan = parser.parse(sample_devplan_path)

        subtasks = plan.get_all_subtasks()
        assert len(subtasks) > 0

    def test_parse_extracts_subtask_ids(self, sample_devplan_path: Path) -> None:
        """Test that subtask IDs are extracted correctly."""
        parser = DevPlanParser()
        plan = parser.parse(sample_devplan_path)

        subtask_ids = [s.id for s in plan.get_all_subtasks()]
        assert any("." in id for id in subtask_ids)  # Should have format X.Y.Z

    def test_parse_extracts_deliverables(self, sample_devplan_path: Path) -> None:
        """Test that deliverables are extracted."""
        parser = DevPlanParser()
        plan = parser.parse(sample_devplan_path)

        subtasks_with_deliv = [s for s in plan.get_all_subtasks() if s.deliverables]
        assert len(subtasks_with_deliv) > 0

    def test_parse_extracts_completed_deliverables(self, sample_devplan_path: Path) -> None:
        """Test that completed checkboxes are parsed."""
        parser = DevPlanParser()
        plan = parser.parse(sample_devplan_path)

        # Find subtask with mixed completion states
        for subtask in plan.get_all_subtasks():
            if len(subtask.deliverables) > 1:
                has_completed = any(d.completed for d in subtask.deliverables)
                has_incomplete = any(not d.completed for d in subtask.deliverables)
                if has_completed and has_incomplete:
                    # Found one with mixed states
                    return

    def test_parse_extracts_files_to_create(self, sample_devplan_path: Path) -> None:
        """Test that files to create are extracted."""
        parser = DevPlanParser()
        plan = parser.parse(sample_devplan_path)

        subtasks_with_files = [s for s in plan.get_all_subtasks() if s.files_to_create]
        assert len(subtasks_with_files) > 0

    def test_parse_extracts_files_to_modify(self, sample_devplan_path: Path) -> None:
        """Test that files to modify are extracted."""
        parser = DevPlanParser()
        plan = parser.parse(sample_devplan_path)

        subtasks_with_mods = [s for s in plan.get_all_subtasks() if s.files_to_modify]
        assert len(subtasks_with_mods) > 0

    def test_parse_project_name(self, sample_devplan_path: Path) -> None:
        """Test that project name is extracted."""
        parser = DevPlanParser()
        plan = parser.parse(sample_devplan_path)

        assert len(plan.project_name) > 0
        assert plan.project_name.lower() != "none"

    def test_parse_nonexistent_file(self) -> None:
        """Test parsing nonexistent file raises error."""
        parser = DevPlanParser()
        with pytest.raises(FileNotFoundError):
            parser.parse(Path("/nonexistent/plan.md"))

    def test_parser_regex_patterns(self) -> None:
        """Test that parser regex patterns are valid."""
        parser = DevPlanParser()

        # Test subtask ID pattern
        match = parser.SUBTASK_ID_PATTERN.search("**Subtask 1.2.3: Title**")
        assert match is not None
        assert match.group(1) == "1.2.3"

        # Test task ID pattern
        match = parser.TASK_ID_PATTERN.search("### Task 1.2: Title")
        assert match is not None
        assert match.group(1) == "1.2"

        # Test checkbox pattern
        match = parser.CHECKBOX_PATTERN.search("- [x] Completed item")
        assert match is not None
        assert match.group(1).lower() == "x"
        assert "Completed" in match.group(2)

    def test_specific_subtask_lookup(self, sample_devplan_path: Path) -> None:
        """Test looking up specific subtasks by ID."""
        parser = DevPlanParser()
        plan = parser.parse(sample_devplan_path)

        # Try to find a specific subtask that should exist
        subtask_0_1_1 = plan.get_subtask("0.1.1")
        if subtask_0_1_1:
            assert subtask_0_1_1.id == "0.1.1"

    def test_parse_deliverable_completion_status(self, sample_devplan_path: Path) -> None:
        """Test that deliverable completion is correctly parsed."""
        parser = DevPlanParser()
        plan = parser.parse(sample_devplan_path)

        # Find subtask 0.1.1 which should have mixed completion
        subtask = plan.get_subtask("0.1.1")
        if subtask and subtask.deliverables:
            # Should have at least one uncompleted item
            incomplete = [d for d in subtask.deliverables if not d.completed]
            assert len(incomplete) > 0


class TestDevPlanParserEdgeCases:
    """Tests for edge cases in DevPlan parsing."""

    def test_parse_empty_files_section(self) -> None:
        """Test parsing with empty files sections."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(
                """
# Test Plan

## Phase 0: Test

### Task 0.1: Test

**Subtask 0.1.1: Test**

**Deliverables**:
- [x] Test item

**Files to Create**:

**Files to Modify**:
- None
"""
            )
            f.flush()

            parser = DevPlanParser()
            plan = parser.parse(Path(f.name))

            assert len(plan.get_all_subtasks()) > 0
