"""Job management for CodeMap analysis service."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Optional

from codemap.analyzer import PyanAnalyzer, SymbolRegistry
from codemap.api.models import JobStatus
from codemap.config import CodeMapConfig
from codemap.logging_config import get_logger
from codemap.output import CodeMapGenerator, MermaidGenerator

if TYPE_CHECKING:
    from codemap.api.storage import ResultsStorage

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
    retrieving, and managing analysis jobs. Delegates persistent storage
    operations to ResultsStorage.

    Attributes:
        _jobs: Dictionary mapping job IDs to Job objects.
        _storage: ResultsStorage instance for persistent result storage.
    """

    def __init__(self, storage: ResultsStorage) -> None:
        """Initialize the job manager.

        Args:
            storage: ResultsStorage instance for persisting job results.
        """
        self._jobs: dict[str, Job] = {}
        self._storage = storage
        logger.debug("JobManager initialized with storage=%s", storage)

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
        return self._storage.get_diagram(job_id, diagram_type)

    def get_code_map(self, job_id: str) -> dict[str, object]:
        """Retrieve CODE_MAP.json for a job.

        Args:
            job_id: Unique job identifier.

        Returns:
            Parsed CODE_MAP.json content as dictionary.

        Raises:
            FileNotFoundError: If CODE_MAP.json not found.
        """
        return self._storage.get_code_map(job_id)

    async def run_job(self, job_id: str) -> None:
        """Run analysis for a job.

        Clones the repository, runs CodeMap analysis, generates outputs,
        and stores results. Cleans up temporary directories after completion.
        Updates job status from PENDING to RUNNING to COMPLETED/FAILED.

        Args:
            job_id: Unique job identifier.

        Side Effects:
            - Updates job status in _jobs dictionary
            - Creates result directory in _results_dir
            - May create temporary directories that are cleaned up
        """
        job = self.get_job(job_id)
        if job is None:
            logger.error("Cannot run job: job %s not found", job_id)
            return

        job.status = JobStatus.RUNNING
        logger.info("Starting job %s for repository %s", job_id, job.repo_url)

        temp_dir = None
        try:
            # Create temporary directory for cloning
            temp_dir = tempfile.mkdtemp(prefix="codemap_job_")
            logger.debug("Created temporary directory: %s", temp_dir)

            # Clone repository
            logger.debug(
                "Cloning repository %s (branch: %s) to %s",
                job.repo_url,
                job.branch,
                temp_dir,
            )
            subprocess.run(
                [
                    "git",
                    "clone",
                    "--depth=1",
                    "-b",
                    job.branch,
                    job.repo_url,
                    temp_dir,
                ],
                check=True,
                timeout=120,
                capture_output=True,
                text=True,
            )
            logger.debug("Repository cloned successfully")

            # Create result directory
            result_dir = self._storage.get_job_dir(job_id)
            result_dir.mkdir(parents=True, exist_ok=True)
            job.result_path = result_dir
            logger.debug("Created result directory: %s", result_dir)

            # Run analysis using CodeMap analyzers
            logger.debug("Starting code analysis for job %s", job_id)
            config = CodeMapConfig(source_dir=Path(temp_dir), output_dir=result_dir)

            # Analyze code with PyanAnalyzer
            analyzer = PyanAnalyzer(config)
            symbol_registry = SymbolRegistry()
            graph = analyzer.analyze(symbol_registry)
            logger.debug("Code analysis complete, found %d symbols", len(symbol_registry))

            # Generate CODE_MAP.json
            code_map_generator = CodeMapGenerator(symbol_registry, graph, config)
            code_map = code_map_generator.generate()
            logger.debug("Generated CODE_MAP.json for job %s", job_id)

            # Generate Mermaid diagrams
            mermaid_generator = MermaidGenerator(graph, symbol_registry)
            diagrams = {
                "module": mermaid_generator.generate_module_diagram(),
                "function": mermaid_generator.generate_function_diagram(),
                "impact": mermaid_generator.generate_impact_diagram(),
            }
            logger.debug("Generated %d diagrams for job %s", len(diagrams), job_id)

            # Save results to storage
            self._storage.save_results(job_id, code_map, diagrams)
            logger.debug("Saved results to storage for job %s", job_id)

            # Mark job as completed
            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.now(timezone.utc)
            logger.info("Job %s completed successfully", job_id)

        except subprocess.CalledProcessError as exc:
            job.status = JobStatus.FAILED
            job.error = f"Git clone failed: {exc.stderr}"
            job.completed_at = datetime.now(timezone.utc)
            logger.error("Job %s failed during git clone: %s", job_id, exc.stderr)

        except FileNotFoundError as exc:
            job.status = JobStatus.FAILED
            job.error = f"Git not found or repository not accessible: {str(exc)}"
            job.completed_at = datetime.now(timezone.utc)
            logger.error("Job %s failed: git not available", job_id)

        except Exception as exc:
            job.status = JobStatus.FAILED
            job.error = f"Analysis failed: {str(exc)}"
            job.completed_at = datetime.now(timezone.utc)
            logger.error("Job %s failed with exception: %s", job_id, exc, exc_info=True)

        finally:
            # Clean up temporary directory
            if temp_dir and Path(temp_dir).exists():
                try:
                    shutil.rmtree(temp_dir)
                    logger.debug("Cleaned up temporary directory: %s", temp_dir)
                except Exception as cleanup_exc:
                    logger.warning(
                        "Failed to clean up temp directory %s: %s", temp_dir, cleanup_exc
                    )
