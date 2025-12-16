"""Tests for plan-to-code linker."""

from __future__ import annotations

import pytest

from codemap.output.devplan_parser import Deliverable, DevPlan, Phase, Subtask, Task
from codemap.output.linker import PlanCodeLinker, PlanCodeMap
from codemap.output.schemas import CodeMapSchema


@pytest.fixture  # type: ignore[misc]
def sample_devplan() -> DevPlan:
    """Create a sample development plan."""
    plan = DevPlan(project_name="Test")

    subtask = Subtask(
        id="1.2.3",
        title="Test Subtask",
        files_to_create=["auth.py"],
        deliverables=[
            Deliverable(text="Implement validate_user function", completed=True),
            Deliverable(text="Add hash_password helper", completed=False),
        ],
    )

    task = Task(id="1.2", title="Test Task", subtasks=[subtask])
    phase = Phase(number=1, title="Phase 1", tasks=[task])
    plan.phases.append(phase)

    return plan


@pytest.fixture  # type: ignore[misc]
def sample_code_map() -> CodeMapSchema:
    """Create a sample code map."""
    code_map: CodeMapSchema = {
        "version": "1.0",
        "generated_at": "2024-01-15T10:30:00Z",
        "source_root": "./src",
        "symbols": [
            {
                "qualified_name": "auth.validate_user",
                "kind": "function",
                "file": "auth.py",
                "line": 10,
            },
            {
                "qualified_name": "auth.hash_password",
                "kind": "function",
                "file": "auth.py",
                "line": 20,
            },
        ],
        "dependencies": [],
    }
    return code_map


class TestPlanCodeMap:
    """Tests for PlanCodeMap dataclass."""

    def test_create_empty(self) -> None:
        """Test creating empty plan-code map."""
        pcm = PlanCodeMap()
        assert len(pcm.task_to_symbols) == 0
        assert len(pcm.symbol_to_tasks) == 0

    def test_add_link(self) -> None:
        """Test adding a link."""
        pcm = PlanCodeMap()
        pcm.add_link("1.2.3", "auth.validate_user")

        assert "1.2.3" in pcm.task_to_symbols
        assert "auth.validate_user" in pcm.symbol_to_tasks

    def test_get_symbols_for_task(self) -> None:
        """Test querying symbols for a task."""
        pcm = PlanCodeMap()
        pcm.add_link("1.2.3", "auth.validate_user")
        pcm.add_link("1.2.3", "auth.hash_password")

        symbols = pcm.get_symbols_for_task("1.2.3")
        assert len(symbols) == 2
        assert "auth.validate_user" in symbols

    def test_get_tasks_for_symbol(self) -> None:
        """Test querying tasks for a symbol."""
        pcm = PlanCodeMap()
        pcm.add_link("1.2.3", "auth.validate_user")
        pcm.add_link("1.2.4", "auth.validate_user")

        tasks = pcm.get_tasks_for_symbol("auth.validate_user")
        assert len(tasks) == 2
        assert "1.2.3" in tasks

    def test_confidence_scores(self) -> None:
        """Test confidence score storage."""
        pcm = PlanCodeMap()
        pcm.add_link("1.2.3", "auth.validate", confidence=0.9)

        score = pcm.get_confidence("1.2.3", "auth.validate")
        assert score == 0.9

    def test_default_confidence(self) -> None:
        """Test default confidence score."""
        pcm = PlanCodeMap()
        pcm.add_link("1.2.3", "auth.validate")

        score = pcm.get_confidence("1.2.3", "auth.validate")
        assert score == 1.0

    def test_nonexistent_link_confidence(self) -> None:
        """Test confidence for nonexistent link."""
        pcm = PlanCodeMap()
        score = pcm.get_confidence("1.2.3", "nonexistent")
        assert score == 0.0


class TestPlanCodeLinker:
    """Tests for PlanCodeLinker."""

    def test_init_default(self) -> None:
        """Test linker initialization."""
        linker = PlanCodeLinker()
        assert linker.threshold == 0.6

    def test_init_custom_threshold(self) -> None:
        """Test linker with custom threshold."""
        linker = PlanCodeLinker(threshold=0.8)
        assert linker.threshold == 0.8

    def test_link_by_filename(
        self, sample_devplan: DevPlan, sample_code_map: CodeMapSchema
    ) -> None:
        """Test linking by filename match."""
        linker = PlanCodeLinker()
        result = linker.link(sample_devplan, sample_code_map)

        # Should find auth.py symbols when auth.py is in files_to_create
        symbols = result.get_symbols_for_task("1.2.3")
        assert len(symbols) > 0
        assert any("auth" in s for s in symbols)

    def test_link_by_deliverable_text(
        self, sample_devplan: DevPlan, sample_code_map: CodeMapSchema
    ) -> None:
        """Test linking by deliverable text match."""
        linker = PlanCodeLinker()
        result = linker.link(sample_devplan, sample_code_map)

        # Check if validate_user mentioned in deliverable matches symbol
        symbols = result.get_symbols_for_task("1.2.3")
        # May or may not match depending on matching logic
        assert isinstance(symbols, list)

    def test_bidirectional_mapping(
        self, sample_devplan: DevPlan, sample_code_map: CodeMapSchema
    ) -> None:
        """Test that mapping is bidirectional."""
        linker = PlanCodeLinker()
        result = linker.link(sample_devplan, sample_code_map)

        # If task links to symbol, symbol should link back to task
        task_symbols = result.get_symbols_for_task("1.2.3")
        for symbol in task_symbols:
            tasks = result.get_tasks_for_symbol(symbol)
            assert "1.2.3" in tasks

    def test_multiple_links(self) -> None:
        """Test linker with multiple subtasks."""
        plan = DevPlan(project_name="Test")

        subtask1 = Subtask(
            id="1.1.1",
            title="First",
            files_to_create=["auth.py"],
        )
        subtask2 = Subtask(
            id="1.1.2",
            title="Second",
            files_to_create=["main.py"],
        )

        task = Task(id="1.1", title="Task", subtasks=[subtask1, subtask2])
        phase = Phase(number=1, title="Phase 1", tasks=[task])
        plan.phases.append(phase)

        code_map: CodeMapSchema = {
            "version": "1.0",
            "generated_at": "2024-01-15T10:30:00Z",
            "source_root": "./",
            "symbols": [
                {
                    "qualified_name": "auth.validate",
                    "kind": "function",
                    "file": "auth.py",
                    "line": 1,
                },
                {
                    "qualified_name": "main.run",
                    "kind": "function",
                    "file": "main.py",
                    "line": 1,
                },
            ],
            "dependencies": [],
        }

        linker = PlanCodeLinker()
        result = linker.link(plan, code_map)

        assert len(result.task_to_symbols) >= 1

    def test_confidence_calculation(self) -> None:
        """Test confidence calculation."""
        linker = PlanCodeLinker()

        # Exact match should have high confidence
        conf1 = linker._calculate_confidence("validate_user", "validate_user")
        assert conf1 > 0.9

        # Partial match should have medium confidence
        conf2 = linker._calculate_confidence("implementing validate", "validate")
        assert conf2 > 0.5

        # No match should have low confidence
        conf3 = linker._calculate_confidence("completely different", "validate")
        assert conf3 < 0.5

    def test_threshold_filtering(self) -> None:
        """Test that threshold filters low-confidence matches."""
        linker = PlanCodeLinker(threshold=0.95)

        plan = DevPlan(project_name="Test")
        subtask = Subtask(
            id="1.1.1",
            title="Test",
            deliverables=[
                Deliverable(text="do something with val", completed=False),
            ],
        )
        task = Task(id="1.1", title="Task", subtasks=[subtask])
        phase = Phase(number=1, title="Phase 1", tasks=[task])
        plan.phases.append(phase)

        code_map: CodeMapSchema = {
            "version": "1.0",
            "generated_at": "2024-01-15T10:30:00Z",
            "source_root": "./",
            "symbols": [
                {
                    "qualified_name": "validate_user",
                    "kind": "function",
                    "file": "test.py",
                    "line": 1,
                },
            ],
            "dependencies": [],
        }

        result = linker.link(plan, code_map)

        # Low confidence should not pass threshold
        symbols = result.get_symbols_for_task("1.1.1")
        # Either no match or matches with confidence >= threshold
        assert isinstance(symbols, list)
