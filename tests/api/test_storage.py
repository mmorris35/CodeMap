"""Tests for results storage backend."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import cast

import pytest

from codemap.api.storage import ResultsStorage


@pytest.fixture
def temp_storage_dir() -> object:
    """Create a temporary storage directory.

    Yields:
        Path to temporary directory.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def storage(temp_storage_dir: Path) -> ResultsStorage:
    """Create a ResultsStorage instance with temporary directory.

    Args:
        temp_storage_dir: Temporary storage directory.

    Returns:
        ResultsStorage instance.
    """
    return ResultsStorage(temp_storage_dir)


class TestResultsStorageInitialization:
    """Tests for ResultsStorage initialization."""

    def test_storage_creates_base_directory(self) -> None:
        """Test that storage creates base directory if it doesn't exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir) / "nonexistent" / "path"
            assert not base_dir.exists()

            _ = ResultsStorage(base_dir)

            assert base_dir.exists()
            assert base_dir.is_dir()

    def test_storage_with_existing_directory(self) -> None:
        """Test that storage works with existing directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            assert base_dir.exists()

            _ = ResultsStorage(base_dir)

            assert base_dir.exists()
            assert base_dir.is_dir()


class TestJobDirectory:
    """Tests for job directory management."""

    def test_get_job_dir_returns_correct_path(self, storage: ResultsStorage) -> None:
        """Test that get_job_dir returns correct path."""
        job_id = "test_job_123"
        job_dir = storage.get_job_dir(job_id)

        assert job_dir.name == job_id
        assert job_dir.parent == storage._base_dir

    def test_get_job_dir_with_different_ids(self, storage: ResultsStorage) -> None:
        """Test get_job_dir with different job IDs."""
        job_ids = ["job1", "job2", "job3"]
        dirs = [storage.get_job_dir(job_id) for job_id in job_ids]

        assert len(dirs) == 3
        assert all(isinstance(d, Path) for d in dirs)
        assert dirs[0] != dirs[1] != dirs[2]


class TestSaveResults:
    """Tests for saving analysis results."""

    def test_save_code_map_and_diagrams(self, storage: ResultsStorage) -> None:
        """Test saving CODE_MAP and diagrams."""
        job_id = "job_12345"
        code_map: dict[str, object] = {"version": "1.0", "files": {"main.py": {}}}
        diagrams: dict[str, str] = {
            "module": "graph TD\n    A[Main] --> B[Util]",
            "function": "graph TD\n    F1[func1] --> F2[func2]",
        }

        storage.save_results(job_id, code_map, diagrams)

        job_dir = storage.get_job_dir(job_id)
        assert job_dir.exists()

        # Verify CODE_MAP.json
        code_map_file = job_dir / "CODE_MAP.json"
        assert code_map_file.exists()
        assert json.loads(code_map_file.read_text()) == code_map

        # Verify diagrams
        module_file = job_dir / "module.mermaid"
        assert module_file.exists()
        assert module_file.read_text() == diagrams["module"]

        function_file = job_dir / "function.mermaid"
        assert function_file.exists()
        assert function_file.read_text() == diagrams["function"]

    def test_save_results_with_three_diagram_types(self, storage: ResultsStorage) -> None:
        """Test saving results with module, function, and impact diagrams."""
        job_id = "job_abc123"
        code_map: dict[str, object] = {"version": "1.0", "files": {}}
        diagrams: dict[str, str] = {
            "module": "graph TD",
            "function": "graph TD",
            "impact": "graph TD",
        }

        storage.save_results(job_id, code_map, diagrams)

        job_dir = storage.get_job_dir(job_id)
        assert (job_dir / "module.mermaid").exists()
        assert (job_dir / "function.mermaid").exists()
        assert (job_dir / "impact.mermaid").exists()

    def test_save_results_creates_job_directory(self, storage: ResultsStorage) -> None:
        """Test that save_results creates job directory."""
        job_id = "new_job"
        job_dir = storage.get_job_dir(job_id)
        assert not job_dir.exists()

        storage.save_results(job_id, cast(dict[str, object], {}), cast(dict[str, str], {}))

        assert job_dir.exists()

    def test_save_results_overwrites_existing_files(self, storage: ResultsStorage) -> None:
        """Test that save_results overwrites existing files."""
        job_id = "job_123"
        code_map_1: dict[str, object] = {"version": "1.0", "files": {}}
        code_map_2: dict[str, object] = {"version": "2.0", "files": {"new.py": {}}}

        storage.save_results(job_id, code_map_1, {})
        storage.save_results(job_id, code_map_2, {})

        loaded = storage.get_code_map(job_id)
        assert loaded == code_map_2

    def test_save_results_with_special_characters_in_diagrams(
        self, storage: ResultsStorage
    ) -> None:
        """Test saving diagrams with special characters."""
        job_id = "job_special"
        code_map: dict[str, object] = {}
        diagrams = {
            "module": 'graph TD\n    A["Function with\nspecial chars: @#$"]',
        }

        storage.save_results(job_id, code_map, diagrams)

        retrieved = storage.get_diagram(job_id, "module")
        assert retrieved == diagrams["module"]


class TestGetCodeMap:
    """Tests for retrieving CODE_MAP.json."""

    def test_get_code_map_success(self, storage: ResultsStorage) -> None:
        """Test successful CODE_MAP retrieval."""
        job_id = "job_xyz"
        code_map: dict[str, object] = {
            "version": "1.0",
            "files": {"main.py": {"functions": {}}},
        }

        storage.save_results(job_id, code_map, {})
        retrieved = storage.get_code_map(job_id)

        assert retrieved == code_map

    def test_get_code_map_not_found(self, storage: ResultsStorage) -> None:
        """Test CODE_MAP retrieval when file doesn't exist."""
        with pytest.raises(FileNotFoundError):
            storage.get_code_map("nonexistent_job")

    def test_get_code_map_preserves_structure(self, storage: ResultsStorage) -> None:
        """Test that CODE_MAP structure is preserved."""
        job_id = "job_struct"
        code_map: dict[str, object] = {
            "version": "1.0",
            "files": {
                "mod1.py": {
                    "functions": {"func1": {"line": 10}},
                    "classes": {"Class1": {"line": 5}},
                },
                "mod2.py": {"functions": {"func2": {"line": 20}}},
            },
        }

        storage.save_results(job_id, code_map, cast(dict[str, str], {}))
        retrieved = storage.get_code_map(job_id)

        assert retrieved["version"] == "1.0"
        files = cast(dict[str, object], retrieved.get("files"))
        assert "mod1.py" in files
        assert "mod2.py" in files
        mod1 = cast(dict[str, object], files["mod1.py"])
        functions = cast(dict[str, object], mod1["functions"])
        func1 = cast(dict[str, object], functions["func1"])
        assert func1["line"] == 10


class TestGetDiagram:
    """Tests for retrieving Mermaid diagrams."""

    def test_get_diagram_success(self, storage: ResultsStorage) -> None:
        """Test successful diagram retrieval."""
        job_id = "job_diagram"
        diagram_content = "graph TD\n    A[Main] --> B[Utils]"
        diagrams = {"module": diagram_content}

        storage.save_results(job_id, {}, diagrams)
        retrieved = storage.get_diagram(job_id, "module")

        assert retrieved == diagram_content

    def test_get_diagram_not_found(self, storage: ResultsStorage) -> None:
        """Test diagram retrieval when file doesn't exist."""
        job_id = "job_no_diagram"
        storage.save_results(job_id, cast(dict[str, object], {}), cast(dict[str, str], {}))

        with pytest.raises(FileNotFoundError):
            storage.get_diagram(job_id, "nonexistent")

    def test_get_diagram_job_not_found(self, storage: ResultsStorage) -> None:
        """Test diagram retrieval when job doesn't exist."""
        with pytest.raises(FileNotFoundError):
            storage.get_diagram("nonexistent_job", "module")

    def test_get_multiple_diagram_types(self, storage: ResultsStorage) -> None:
        """Test retrieving different diagram types."""
        job_id = "job_multi_diagram"
        diagrams: dict[str, str] = {
            "module": "graph TD\n    M1 --> M2",
            "function": "graph TD\n    F1 --> F2",
            "impact": "graph TD\n    I1 --> I2",
        }

        storage.save_results(job_id, {}, diagrams)

        assert storage.get_diagram(job_id, "module") == diagrams["module"]
        assert storage.get_diagram(job_id, "function") == diagrams["function"]
        assert storage.get_diagram(job_id, "impact") == diagrams["impact"]


class TestListJobs:
    """Tests for listing stored jobs."""

    def test_list_jobs_empty_storage(self, storage: ResultsStorage) -> None:
        """Test listing jobs from empty storage."""
        jobs = storage.list_jobs()
        assert jobs == []

    def test_list_jobs_with_single_job(self, storage: ResultsStorage) -> None:
        """Test listing jobs with single job."""
        job_id = "job_single"
        storage.save_results(job_id, cast(dict[str, object], {}), cast(dict[str, str], {}))

        jobs = storage.list_jobs()
        assert jobs == [job_id]

    def test_list_jobs_with_multiple_jobs(self, storage: ResultsStorage) -> None:
        """Test listing multiple jobs."""
        job_ids = ["job_1", "job_2", "job_3"]
        for job_id in job_ids:
            storage.save_results(job_id, cast(dict[str, object], {}), cast(dict[str, str], {}))

        jobs = storage.list_jobs()
        assert len(jobs) == 3
        assert all(job_id in jobs for job_id in job_ids)

    def test_list_jobs_returns_sorted_list(self, storage: ResultsStorage) -> None:
        """Test that list_jobs returns sorted list."""
        job_ids = ["job_z", "job_a", "job_m"]
        for job_id in job_ids:
            storage.save_results(job_id, cast(dict[str, object], {}), cast(dict[str, str], {}))

        jobs = storage.list_jobs()
        assert jobs == sorted(job_ids)

    def test_list_jobs_ignores_files_in_base_dir(self, storage: ResultsStorage) -> None:
        """Test that list_jobs ignores files in base directory."""
        job_id = "job_valid"
        storage.save_results(job_id, cast(dict[str, object], {}), cast(dict[str, str], {}))

        # Create a file in the base directory
        file_path = storage._base_dir / "not_a_job.txt"
        file_path.write_text("test")

        jobs = storage.list_jobs()
        assert jobs == [job_id]


class TestDeleteResults:
    """Tests for deleting job results."""

    def test_delete_results_success(self, storage: ResultsStorage) -> None:
        """Test successful deletion of job results."""
        job_id = "job_delete"
        storage.save_results(
            job_id,
            cast(dict[str, object], {"data": "test"}),
            cast(dict[str, str], {"module": "graph"}),
        )

        assert storage.job_exists(job_id)

        result = storage.delete_results(job_id)

        assert result is True
        assert not storage.job_exists(job_id)

    def test_delete_results_nonexistent_job(self, storage: ResultsStorage) -> None:
        """Test deleting nonexistent job returns False."""
        result = storage.delete_results("nonexistent_job")
        assert result is False

    def test_delete_results_removes_all_files(self, storage: ResultsStorage) -> None:
        """Test that delete removes all files in job directory."""
        job_id = "job_full_delete"
        code_map: dict[str, object] = {"version": "1.0"}
        diagrams: dict[str, str] = {"module": "graph", "function": "graph", "impact": "graph"}

        storage.save_results(job_id, code_map, diagrams)
        job_dir = storage.get_job_dir(job_id)

        # Verify files exist
        assert (job_dir / "CODE_MAP.json").exists()
        assert (job_dir / "module.mermaid").exists()
        assert (job_dir / "function.mermaid").exists()
        assert (job_dir / "impact.mermaid").exists()

        # Delete
        storage.delete_results(job_id)

        # Verify all files gone
        assert not job_dir.exists()

    def test_delete_results_idempotent(self, storage: ResultsStorage) -> None:
        """Test that delete can be called multiple times safely."""
        job_id = "job_idempotent"
        storage.save_results(job_id, cast(dict[str, object], {}), cast(dict[str, str], {}))

        result1 = storage.delete_results(job_id)
        result2 = storage.delete_results(job_id)

        assert result1 is True
        assert result2 is False


class TestJobExists:
    """Tests for checking job existence."""

    def test_job_exists_true(self, storage: ResultsStorage) -> None:
        """Test job_exists returns True for existing job."""
        job_id = "job_exists"
        storage.save_results(job_id, cast(dict[str, object], {}), cast(dict[str, str], {}))

        assert storage.job_exists(job_id) is True

    def test_job_exists_false(self, storage: ResultsStorage) -> None:
        """Test job_exists returns False for nonexistent job."""
        assert storage.job_exists("nonexistent") is False

    def test_job_exists_after_deletion(self, storage: ResultsStorage) -> None:
        """Test job_exists after deletion."""
        job_id = "job_after_delete"
        storage.save_results(job_id, cast(dict[str, object], {}), cast(dict[str, str], {}))
        assert storage.job_exists(job_id) is True

        storage.delete_results(job_id)
        assert storage.job_exists(job_id) is False


class TestMetadataStorage:
    """Tests for metadata storage (extensibility feature)."""

    def test_save_and_get_metadata(self, storage: ResultsStorage) -> None:
        """Test saving and retrieving job metadata."""
        job_id = "job_meta"
        metadata: dict[str, object] = {
            "repo_url": "https://github.com/user/repo",
            "branch": "main",
            "duration_seconds": 42,
        }

        storage.save_job_metadata(job_id, metadata)
        retrieved = storage.get_job_metadata(job_id)

        assert retrieved == metadata

    def test_get_metadata_not_found(self, storage: ResultsStorage) -> None:
        """Test retrieving metadata that doesn't exist."""
        result = storage.get_job_metadata("nonexistent_job")
        assert result is None

    def test_get_metadata_without_saving(self, storage: ResultsStorage) -> None:
        """Test getting metadata from job without metadata file."""
        job_id = "job_no_meta"
        storage.save_results(job_id, cast(dict[str, object], {}), cast(dict[str, str], {}))

        result = storage.get_job_metadata(job_id)
        assert result is None

    def test_metadata_independent_from_results(self, storage: ResultsStorage) -> None:
        """Test that metadata and results are independent."""
        job_id = "job_independent"
        code_map: dict[str, object] = {"version": "1.0"}
        metadata: dict[str, object] = {"key": "value"}

        storage.save_results(job_id, code_map, {})
        storage.save_job_metadata(job_id, metadata)

        # Both should be accessible
        assert storage.get_code_map(job_id) == code_map
        assert storage.get_job_metadata(job_id) == metadata


class TestStorageIntegration:
    """Integration tests for storage operations."""

    def test_full_workflow(self, storage: ResultsStorage) -> None:
        """Test complete storage workflow."""
        job_id = "job_workflow"
        code_map: dict[str, object] = {
            "version": "1.0",
            "files": {"main.py": {"functions": {"main": {}}}},
        }
        diagrams: dict[str, str] = {
            "module": "graph TD\n    A",
            "function": "graph TD\n    F",
            "impact": "graph TD\n    I",
        }

        # Save
        storage.save_results(job_id, code_map, diagrams)

        # List and verify
        jobs = storage.list_jobs()
        assert job_id in jobs

        # Retrieve
        assert storage.get_code_map(job_id) == code_map
        assert storage.get_diagram(job_id, "module") == diagrams["module"]
        assert storage.get_diagram(job_id, "function") == diagrams["function"]
        assert storage.get_diagram(job_id, "impact") == diagrams["impact"]

        # Delete
        storage.delete_results(job_id)
        assert job_id not in storage.list_jobs()

    def test_multiple_jobs_independent(self, storage: ResultsStorage) -> None:
        """Test that multiple jobs are stored independently."""
        job_1_id = "job_1"
        job_2_id = "job_2"

        code_map_1: dict[str, object] = {"version": "1.0", "data": "job1"}
        code_map_2: dict[str, object] = {"version": "2.0", "data": "job2"}

        storage.save_results(job_1_id, code_map_1, {"module": "A"})
        storage.save_results(job_2_id, code_map_2, {"module": "B"})

        assert storage.get_code_map(job_1_id) == code_map_1
        assert storage.get_code_map(job_2_id) == code_map_2
        assert storage.get_diagram(job_1_id, "module") == "A"
        assert storage.get_diagram(job_2_id, "module") == "B"

        storage.delete_results(job_1_id)
        assert storage.job_exists(job_2_id)
