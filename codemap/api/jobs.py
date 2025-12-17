"""Job management for CodeMap analysis service."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from codemap.api.models import JobStatus
from codemap.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class Job:
    """Represents an analysis job.

    Attributes:
        id: Unique job identifier.
        repo_url: Git repository URL to analyze.
        branch: Git branch to analyze.
        status: Current job status.
        created_at: Timestamp when job was created.
        completed_at: Timestamp when job completed (if finished).
        result_path: Path to job results directory (if completed).
        error: Error message if job failed.
    """

    id: str
    repo_url: str
    branch: str
    status: JobStatus
    created_at: datetime
    completed_at: Optional[datetime] = None
    result_path: Optional[Path] = None
    error: Optional[str] = None


class JobManager:
    """Manages analysis jobs for the CodeMap API.

    Maintains in-memory job storage and provides methods for creating,
    retrieving, and managing analysis jobs.

    Attributes:
        _jobs: Dictionary mapping job IDs to Job objects.
        _results_dir: Base directory for storing job results.
    """

    def __init__(self, results_dir: Path) -> None:
        """Initialize the job manager.

        Args:
            results_dir: Base directory for storing job results.
        """
        self._jobs: dict[str, Job] = {}
        self._results_dir = results_dir
        self._results_dir.mkdir(parents=True, exist_ok=True)
        logger.debug("JobManager initialized with results_dir=%s", results_dir)

    def create_job(
        self,
        repo_url: str,
        branch: str = "main",
    ) -> Job:
        """Create a new analysis job.

        Args:
            repo_url: Git repository URL to analyze.
            branch: Git branch to analyze (default: main).

        Returns:
            Newly created Job object with PENDING status.
        """
        job_id = str(uuid.uuid4())[:8]
        job = Job(
            id=job_id,
            repo_url=repo_url,
            branch=branch,
            status=JobStatus.PENDING,
            created_at=datetime.now(timezone.utc),
        )
        self._jobs[job_id] = job
        logger.info(
            "Created job %s for repository %s branch %s",
            job_id,
            repo_url,
            branch,
        )
        return job

    def get_job(self, job_id: str) -> Optional[Job]:
        """Retrieve a job by ID.

        Args:
            job_id: Unique job identifier.

        Returns:
            Job object if found, None otherwise.
        """
        return self._jobs.get(job_id)

    def get_diagram(self, job_id: str, diagram_type: str) -> str:
        """Retrieve a Mermaid diagram for a job.

        Args:
            job_id: Unique job identifier.
            diagram_type: Type of diagram (e.g., 'module', 'function').

        Returns:
            Mermaid diagram content as string.

        Raises:
            FileNotFoundError: If diagram file not found.
        """
        job = self.get_job(job_id)
        if job is None or job.result_path is None:
            raise FileNotFoundError(f"No results for job {job_id}")

        diagram_file = job.result_path / f"{diagram_type}.mermaid"
        if not diagram_file.exists():
            raise FileNotFoundError(f"Diagram {diagram_type} not found for job {job_id}")

        return diagram_file.read_text()

    def get_code_map(self, job_id: str) -> dict[str, object]:
        """Retrieve CODE_MAP.json for a job.

        Args:
            job_id: Unique job identifier.

        Returns:
            Parsed CODE_MAP.json content as dictionary.

        Raises:
            FileNotFoundError: If CODE_MAP.json not found.
        """
        job = self.get_job(job_id)
        if job is None or job.result_path is None:
            raise FileNotFoundError(f"No results for job {job_id}")

        code_map_file = job.result_path / "CODE_MAP.json"
        if not code_map_file.exists():
            raise FileNotFoundError(f"CODE_MAP not found for job {job_id}")

        result = json.loads(code_map_file.read_text())
        assert isinstance(result, dict)
        return result
