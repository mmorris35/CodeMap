"""Tests for job management and background processing."""

from __future__ import annotations

import asyncio
import json
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch

import pytest

from codemap.api.jobs import Job, JobManager
from codemap.api.models import JobStatus

if TYPE_CHECKING:
    pass


def run_async(coroutine: object) -> object:
    """Run an async coroutine in a synchronous test.

    Args:
        coroutine: Async coroutine to run.

    Returns:
        Result from the coroutine.
    """
    return asyncio.run(coroutine)  # type: ignore


@pytest.fixture
def temp_results_dir() -> object:
    """Create a temporary results directory.

    Yields:
        Path to temporary directory.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def job_manager(temp_results_dir: Path) -> JobManager:
    """Create a job manager with temporary directory.

    Args:
        temp_results_dir: Temporary results directory.

    Returns:
        JobManager instance.
    """
    return JobManager(temp_results_dir)


class TestJobDataclass:
    """Tests for Job dataclass."""

    def test_job_creation_with_defaults(self) -> None:
        """Test creating a Job with default values.

        Verifies that a Job can be created with required fields,
        and optional fields default to None.
        """
        now = datetime.now(timezone.utc)
        job = Job(
            id="job123",
            repo_url="https://github.com/user/repo.git",
            branch="main",
            status=JobStatus.PENDING,
            created_at=now,
        )

        assert job.id == "job123"
        assert job.repo_url == "https://github.com/user/repo.git"
        assert job.branch == "main"
        assert job.status == JobStatus.PENDING
        assert job.created_at == now
        assert job.completed_at is None
        assert job.result_path is None
        assert job.error is None

    def test_job_creation_with_all_fields(self) -> None:
        """Test creating a Job with all fields populated."""
        created = datetime.now(timezone.utc)
        completed = datetime.now(timezone.utc)
        result_path = Path("/tmp/results/job123")

        job = Job(
            id="job123",
            repo_url="https://github.com/user/repo.git",
            branch="develop",
            status=JobStatus.COMPLETED,
            created_at=created,
            completed_at=completed,
            result_path=result_path,
            error=None,
        )

        assert job.id == "job123"
        assert job.status == JobStatus.COMPLETED
        assert job.completed_at == completed
        assert job.result_path == result_path
        assert job.error is None

    def test_job_with_error(self) -> None:
        """Test Job with error message."""
        job = Job(
            id="job123",
            repo_url="https://github.com/user/repo.git",
            branch="main",
            status=JobStatus.FAILED,
            created_at=datetime.now(timezone.utc),
            error="Repository not found",
        )

        assert job.status == JobStatus.FAILED
        assert job.error == "Repository not found"


class TestJobManagerInit:
    """Tests for JobManager initialization."""

    def test_job_manager_creates_results_directory(self) -> None:
        """Test that JobManager creates results directory if it doesn't exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            results_dir = Path(tmpdir) / "results"
            assert not results_dir.exists()

            JobManager(results_dir)

            assert results_dir.exists()
            assert results_dir.is_dir()

    def test_job_manager_uses_existing_directory(self) -> None:
        """Test that JobManager works with existing directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            results_dir = Path(tmpdir) / "results"
            results_dir.mkdir()

            job_manager = JobManager(results_dir)

            assert results_dir.exists()
            assert job_manager._results_dir == results_dir

    def test_job_manager_initializes_empty_jobs(self) -> None:
        """Test that JobManager starts with empty jobs dictionary."""
        with tempfile.TemporaryDirectory() as tmpdir:
            job_manager = JobManager(Path(tmpdir))

            assert len(job_manager._jobs) == 0
            assert job_manager._jobs == {}


class TestJobManagerCreateJob:
    """Tests for JobManager.create_job method."""

    def test_create_job_returns_job_with_pending_status(self, job_manager: JobManager) -> None:
        """Test that create_job returns a Job with PENDING status.

        Args:
            job_manager: JobManager fixture.
        """
        repo_url = "https://github.com/user/repo.git"
        branch = "main"

        job = job_manager.create_job(repo_url, branch)

        assert isinstance(job, Job)
        assert job.status == JobStatus.PENDING
        assert job.repo_url == repo_url
        assert job.branch == branch
        assert job.created_at is not None

    def test_create_job_uses_default_branch(self, job_manager: JobManager) -> None:
        """Test that create_job uses default branch when not specified.

        Args:
            job_manager: JobManager fixture.
        """
        job = job_manager.create_job("https://github.com/user/repo.git")

        assert job.branch == "main"

    def test_create_job_generates_unique_ids(self, job_manager: JobManager) -> None:
        """Test that create_job generates unique job IDs.

        Args:
            job_manager: JobManager fixture.
        """
        job1 = job_manager.create_job("https://github.com/user/repo1.git")
        job2 = job_manager.create_job("https://github.com/user/repo2.git")

        assert job1.id != job2.id

    def test_create_job_stores_in_jobs_dict(self, job_manager: JobManager) -> None:
        """Test that created jobs are stored in _jobs dictionary.

        Args:
            job_manager: JobManager fixture.
        """
        job = job_manager.create_job("https://github.com/user/repo.git")

        assert job.id in job_manager._jobs
        assert job_manager._jobs[job.id] is job

    def test_create_job_returns_different_ids(self, job_manager: JobManager) -> None:
        """Test that multiple create_job calls generate different IDs.

        Args:
            job_manager: JobManager fixture.
        """
        job_ids = set()
        for i in range(10):
            job = job_manager.create_job(f"https://github.com/user/repo{i}.git")
            job_ids.add(job.id)

        assert len(job_ids) == 10

    def test_create_job_id_format(self, job_manager: JobManager) -> None:
        """Test that created job IDs are strings.

        Args:
            job_manager: JobManager fixture.
        """
        job = job_manager.create_job("https://github.com/user/repo.git")

        assert isinstance(job.id, str)
        assert len(job.id) > 0


class TestJobManagerGetJob:
    """Tests for JobManager.get_job method."""

    def test_get_job_returns_existing_job(self, job_manager: JobManager) -> None:
        """Test retrieving an existing job by ID.

        Args:
            job_manager: JobManager fixture.
        """
        created_job = job_manager.create_job("https://github.com/user/repo.git")

        retrieved_job = job_manager.get_job(created_job.id)

        assert retrieved_job is created_job

    def test_get_job_returns_none_for_missing_job(self, job_manager: JobManager) -> None:
        """Test that get_job returns None for non-existent job ID.

        Args:
            job_manager: JobManager fixture.
        """
        result = job_manager.get_job("nonexistent_id")

        assert result is None

    def test_get_job_with_multiple_jobs(self, job_manager: JobManager) -> None:
        """Test retrieving specific job when multiple jobs exist.

        Args:
            job_manager: JobManager fixture.
        """
        job1 = job_manager.create_job("https://github.com/user/repo1.git")
        job2 = job_manager.create_job("https://github.com/user/repo2.git")
        job3 = job_manager.create_job("https://github.com/user/repo3.git")

        assert job_manager.get_job(job1.id) is job1
        assert job_manager.get_job(job2.id) is job2
        assert job_manager.get_job(job3.id) is job3


class TestJobManagerGetDiagram:
    """Tests for JobManager.get_diagram method."""

    def test_get_diagram_returns_file_content(self, job_manager: JobManager) -> None:
        """Test retrieving diagram content from file.

        Args:
            job_manager: JobManager fixture.
        """
        # Create job with result path
        job = job_manager.create_job("https://github.com/user/repo.git")
        result_dir = job_manager._results_dir / job.id
        result_dir.mkdir(parents=True, exist_ok=True)
        job.result_path = result_dir

        # Write diagram file
        diagram_content = "graph TD\n  A[Module A]\n  B[Module B]"
        diagram_file = result_dir / "module.mermaid"
        diagram_file.write_text(diagram_content)

        # Retrieve diagram
        retrieved_content = job_manager.get_diagram(job.id, "module")

        assert retrieved_content == diagram_content

    def test_get_diagram_raises_for_missing_job(self, job_manager: JobManager) -> None:
        """Test that get_diagram raises FileNotFoundError for missing job.

        Args:
            job_manager: JobManager fixture.
        """
        with pytest.raises(FileNotFoundError, match="No results for job"):
            job_manager.get_diagram("nonexistent_id", "module")

    def test_get_diagram_raises_for_missing_file(self, job_manager: JobManager) -> None:
        """Test that get_diagram raises FileNotFoundError for missing diagram.

        Args:
            job_manager: JobManager fixture.
        """
        job = job_manager.create_job("https://github.com/user/repo.git")
        result_dir = job_manager._results_dir / job.id
        result_dir.mkdir(parents=True, exist_ok=True)
        job.result_path = result_dir

        with pytest.raises(FileNotFoundError, match="Diagram module not found"):
            job_manager.get_diagram(job.id, "module")

    def test_get_diagram_different_types(self, job_manager: JobManager) -> None:
        """Test retrieving different diagram types.

        Args:
            job_manager: JobManager fixture.
        """
        job = job_manager.create_job("https://github.com/user/repo.git")
        result_dir = job_manager._results_dir / job.id
        result_dir.mkdir(parents=True, exist_ok=True)
        job.result_path = result_dir

        # Write multiple diagram types
        diagram_types = ["module", "function", "impact"]
        for diagram_type in diagram_types:
            diagram_file = result_dir / f"{diagram_type}.mermaid"
            diagram_file.write_text(f"graph TD\n  [{diagram_type.upper()}]")

        # Retrieve each type
        for diagram_type in diagram_types:
            content = job_manager.get_diagram(job.id, diagram_type)
            assert diagram_type.upper() in content


class TestJobManagerGetCodeMap:
    """Tests for JobManager.get_code_map method."""

    def test_get_code_map_returns_parsed_json(self, job_manager: JobManager) -> None:
        """Test retrieving and parsing CODE_MAP.json.

        Args:
            job_manager: JobManager fixture.
        """
        job = job_manager.create_job("https://github.com/user/repo.git")
        result_dir = job_manager._results_dir / job.id
        result_dir.mkdir(parents=True, exist_ok=True)
        job.result_path = result_dir

        # Write CODE_MAP.json
        code_map_data = {
            "version": "1.0",
            "files": {
                "main.py": {"symbols": ["main"]},
                "utils.py": {"symbols": ["helper"]},
            },
        }
        code_map_file = result_dir / "CODE_MAP.json"
        code_map_file.write_text(json.dumps(code_map_data))

        # Retrieve code map
        retrieved = job_manager.get_code_map(job.id)

        assert retrieved == code_map_data
        assert retrieved["version"] == "1.0"
        files = retrieved.get("files")
        assert isinstance(files, dict)
        assert "main.py" in files

    def test_get_code_map_raises_for_missing_job(self, job_manager: JobManager) -> None:
        """Test that get_code_map raises for missing job.

        Args:
            job_manager: JobManager fixture.
        """
        with pytest.raises(FileNotFoundError, match="No results for job"):
            job_manager.get_code_map("nonexistent_id")

    def test_get_code_map_raises_for_missing_file(self, job_manager: JobManager) -> None:
        """Test that get_code_map raises for missing CODE_MAP.json.

        Args:
            job_manager: JobManager fixture.
        """
        job = job_manager.create_job("https://github.com/user/repo.git")
        result_dir = job_manager._results_dir / job.id
        result_dir.mkdir(parents=True, exist_ok=True)
        job.result_path = result_dir

        with pytest.raises(FileNotFoundError, match="CODE_MAP not found"):
            job_manager.get_code_map(job.id)


class TestJobManagerRunJob:
    """Tests for JobManager.run_job method."""

    def test_run_job_updates_status(self, job_manager: JobManager) -> None:
        """Test that run_job updates job status from PENDING to RUNNING.

        Args:
            job_manager: JobManager fixture.
        """
        job = job_manager.create_job("https://github.com/user/repo.git")
        initial_status = job.status

        # Mock subprocess to avoid actual git clone
        with (
            patch("codemap.api.jobs.subprocess.run"),
            patch("codemap.api.jobs.PyanAnalyzer") as mock_analyzer_class,
            patch("codemap.api.jobs.CodeMapGenerator") as mock_codemap_gen,
            patch("codemap.api.jobs.MermaidGenerator") as mock_mermaid_gen,
        ):
            # Setup mocks
            mock_analyzer = MagicMock()
            mock_analyzer_class.return_value = mock_analyzer
            mock_analyzer.analyze.return_value = MagicMock()

            mock_codemap = MagicMock()
            mock_codemap_gen.return_value = mock_codemap
            mock_codemap.generate.return_value = {"version": "1.0", "files": {}}

            mock_mermaid = MagicMock()
            mock_mermaid_gen.return_value = mock_mermaid
            mock_mermaid.generate_module_diagram.return_value = "graph TD\n  A[A]"
            mock_mermaid.generate_function_diagram.return_value = "graph TD\n  B[B]"
            mock_mermaid.generate_impact_diagram.return_value = "graph TD\n  C[C]"

            run_async(job_manager.run_job(job.id))

        assert initial_status == JobStatus.PENDING
        assert job.status == JobStatus.COMPLETED

    def test_run_job_sets_completed_at(self, job_manager: JobManager) -> None:
        """Test that run_job sets completed_at timestamp.

        Args:
            job_manager: JobManager fixture.
        """
        job = job_manager.create_job("https://github.com/user/repo.git")

        with (
            patch("codemap.api.jobs.subprocess.run"),
            patch("codemap.api.jobs.PyanAnalyzer") as mock_analyzer_class,
            patch("codemap.api.jobs.CodeMapGenerator") as mock_codemap_gen,
            patch("codemap.api.jobs.MermaidGenerator") as mock_mermaid_gen,
        ):
            mock_analyzer = MagicMock()
            mock_analyzer_class.return_value = mock_analyzer
            mock_analyzer.analyze.return_value = MagicMock()

            mock_codemap = MagicMock()
            mock_codemap_gen.return_value = mock_codemap
            mock_codemap.generate.return_value = {"version": "1.0", "files": {}}

            mock_mermaid = MagicMock()
            mock_mermaid_gen.return_value = mock_mermaid
            mock_mermaid.generate_module_diagram.return_value = "graph TD"
            mock_mermaid.generate_function_diagram.return_value = "graph TD"
            mock_mermaid.generate_impact_diagram.return_value = "graph TD"

            run_async(job_manager.run_job(job.id))

        assert job.completed_at is not None
        assert isinstance(job.completed_at, datetime)

    def test_run_job_sets_result_path(self, job_manager: JobManager) -> None:
        """Test that run_job sets result_path on successful completion.

        Args:
            job_manager: JobManager fixture.
        """
        job = job_manager.create_job("https://github.com/user/repo.git")

        with (
            patch("codemap.api.jobs.subprocess.run"),
            patch("codemap.api.jobs.PyanAnalyzer") as mock_analyzer_class,
            patch("codemap.api.jobs.CodeMapGenerator") as mock_codemap_gen,
            patch("codemap.api.jobs.MermaidGenerator") as mock_mermaid_gen,
        ):
            mock_analyzer = MagicMock()
            mock_analyzer_class.return_value = mock_analyzer
            mock_analyzer.analyze.return_value = MagicMock()

            mock_codemap = MagicMock()
            mock_codemap_gen.return_value = mock_codemap
            mock_codemap.generate.return_value = {"version": "1.0", "files": {}}

            mock_mermaid = MagicMock()
            mock_mermaid_gen.return_value = mock_mermaid
            mock_mermaid.generate_module_diagram.return_value = "graph TD"
            mock_mermaid.generate_function_diagram.return_value = "graph TD"
            mock_mermaid.generate_impact_diagram.return_value = "graph TD"

            run_async(job_manager.run_job(job.id))

        assert job.result_path is not None
        assert job.result_path.exists()

    def test_run_job_handles_git_failure(self, job_manager: JobManager) -> None:
        """Test that run_job handles git clone failures gracefully.

        Args:
            job_manager: JobManager fixture.
        """
        job = job_manager.create_job("https://github.com/invalid/repo.git")

        from subprocess import CalledProcessError

        with patch("codemap.api.jobs.subprocess.run") as mock_run:
            mock_run.side_effect = CalledProcessError(1, "git", stderr="Repository not found")

            run_async(job_manager.run_job(job.id))

        assert job.status == JobStatus.FAILED
        assert job.error is not None
        assert "Repository not found" in job.error

    def test_run_job_handles_missing_job(self, job_manager: JobManager) -> None:
        """Test that run_job handles missing job gracefully.

        Args:
            job_manager: JobManager fixture.
        """
        # Should not raise an exception
        run_async(job_manager.run_job("nonexistent_id"))

    def test_run_job_creates_diagram_files(self, job_manager: JobManager) -> None:
        """Test that run_job creates diagram files.

        Args:
            job_manager: JobManager fixture.
        """
        job = job_manager.create_job("https://github.com/user/repo.git")

        with (
            patch("codemap.api.jobs.subprocess.run"),
            patch("codemap.api.jobs.PyanAnalyzer") as mock_analyzer_class,
            patch("codemap.api.jobs.CodeMapGenerator") as mock_codemap_gen,
            patch("codemap.api.jobs.MermaidGenerator") as mock_mermaid_gen,
        ):
            mock_analyzer = MagicMock()
            mock_analyzer_class.return_value = mock_analyzer
            mock_analyzer.analyze.return_value = MagicMock()

            mock_codemap = MagicMock()
            mock_codemap_gen.return_value = mock_codemap
            mock_codemap.generate.return_value = {"version": "1.0", "files": {}}

            mock_mermaid = MagicMock()
            mock_mermaid_gen.return_value = mock_mermaid
            mock_mermaid.generate_module_diagram.return_value = "graph TD\n  [MODULE]"
            mock_mermaid.generate_function_diagram.return_value = "graph TD\n  [FUNCTION]"
            mock_mermaid.generate_impact_diagram.return_value = "graph TD\n  [IMPACT]"

            run_async(job_manager.run_job(job.id))

        # Check that diagram files were created
        assert job.result_path is not None
        assert (job.result_path / "module.mermaid").exists()
        assert (job.result_path / "function.mermaid").exists()
        assert (job.result_path / "impact.mermaid").exists()

    def test_run_job_creates_code_map_json(self, job_manager: JobManager) -> None:
        """Test that run_job creates CODE_MAP.json file.

        Args:
            job_manager: JobManager fixture.
        """
        job = job_manager.create_job("https://github.com/user/repo.git")

        with (
            patch("codemap.api.jobs.subprocess.run"),
            patch("codemap.api.jobs.PyanAnalyzer") as mock_analyzer_class,
            patch("codemap.api.jobs.CodeMapGenerator") as mock_codemap_gen,
            patch("codemap.api.jobs.MermaidGenerator") as mock_mermaid_gen,
        ):
            mock_analyzer = MagicMock()
            mock_analyzer_class.return_value = mock_analyzer
            mock_analyzer.analyze.return_value = MagicMock()

            mock_codemap = MagicMock()
            mock_codemap_gen.return_value = mock_codemap
            mock_codemap.generate.return_value = {
                "version": "1.0",
                "files": {"main.py": {"symbols": ["main"]}},
            }

            mock_mermaid = MagicMock()
            mock_mermaid_gen.return_value = mock_mermaid
            mock_mermaid.generate_module_diagram.return_value = "graph TD"
            mock_mermaid.generate_function_diagram.return_value = "graph TD"
            mock_mermaid.generate_impact_diagram.return_value = "graph TD"

            run_async(job_manager.run_job(job.id))

        # Check CODE_MAP.json was created
        assert job.result_path is not None
        code_map_file = job.result_path / "CODE_MAP.json"
        assert code_map_file.exists()

        code_map_data = json.loads(code_map_file.read_text())
        assert code_map_data["version"] == "1.0"
        assert "main.py" in code_map_data["files"]

    def test_run_job_cleanup_temp_dir(self, job_manager: JobManager) -> None:
        """Test that run_job cleans up temporary directory after completion.

        Args:
            job_manager: JobManager fixture.
        """
        job = job_manager.create_job("https://github.com/user/repo.git")
        temp_dirs_cleaned = []

        original_rmtree = shutil.rmtree

        def mock_rmtree(path: object) -> None:
            """Mock shutil.rmtree to track cleanup."""
            temp_dirs_cleaned.append(str(path))
            original_rmtree(str(path))

        with (
            patch("codemap.api.jobs.subprocess.run"),
            patch("codemap.api.jobs.shutil.rmtree", side_effect=mock_rmtree),
            patch("codemap.api.jobs.PyanAnalyzer") as mock_analyzer_class,
            patch("codemap.api.jobs.CodeMapGenerator") as mock_codemap_gen,
            patch("codemap.api.jobs.MermaidGenerator") as mock_mermaid_gen,
        ):
            mock_analyzer = MagicMock()
            mock_analyzer_class.return_value = mock_analyzer
            mock_analyzer.analyze.return_value = MagicMock()

            mock_codemap = MagicMock()
            mock_codemap_gen.return_value = mock_codemap
            mock_codemap.generate.return_value = {"version": "1.0", "files": {}}

            mock_mermaid = MagicMock()
            mock_mermaid_gen.return_value = mock_mermaid
            mock_mermaid.generate_module_diagram.return_value = "graph TD"
            mock_mermaid.generate_function_diagram.return_value = "graph TD"
            mock_mermaid.generate_impact_diagram.return_value = "graph TD"

            run_async(job_manager.run_job(job.id))

        # Verify that rmtree was called for temp directory cleanup
        assert len(temp_dirs_cleaned) > 0
