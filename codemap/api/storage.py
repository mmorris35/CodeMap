"""Results storage backend for CodeMap analysis jobs."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Optional

from codemap.logging_config import get_logger

logger = get_logger(__name__)


class ResultsStorage:
    """Manages persistent storage of analysis job results.

    Provides a local filesystem backend for storing job results including
    CODE_MAP.json and Mermaid diagrams. Results are organized by job ID
    in a configurable base directory.

    Attributes:
        _base_dir: Root directory for storing all job results.
    """

    def __init__(self, base_dir: Path) -> None:
        """Initialize the results storage.

        Args:
            base_dir: Base directory for storing job results.
                      Created if it doesn't exist.
        """
        self._base_dir = base_dir
        self._base_dir.mkdir(parents=True, exist_ok=True)
        logger.debug("ResultsStorage initialized with base_dir=%s", base_dir)

    def get_job_dir(self, job_id: str) -> Path:
        """Get the directory for a specific job.

        Args:
            job_id: Unique job identifier.

        Returns:
            Path to the job's result directory.
        """
        return self._base_dir / job_id

    def save_results(
        self,
        job_id: str,
        code_map: dict[str, object],
        diagrams: dict[str, str],
    ) -> None:
        """Save analysis results to disk.

        Saves CODE_MAP.json and Mermaid diagram files to the job's result
        directory. Creates directory structure as needed.

        Args:
            job_id: Unique job identifier.
            code_map: CODE_MAP.json content as dictionary.
            diagrams: Dictionary of diagram_type -> diagram_content.
                      Common types: 'module', 'function', 'impact'.

        Raises:
            IOError: If unable to write to filesystem.

        Example:
            >>> storage.save_results(
            ...     job_id="abc12345",
            ...     code_map={"version": "1.0", "files": {}},
            ...     diagrams={
            ...         "module": "graph TD...",
            ...         "function": "graph TD...",
            ...     }
            ... )
        """
        job_dir = self.get_job_dir(job_id)
        job_dir.mkdir(parents=True, exist_ok=True)
        logger.debug("Saving results to %s", job_dir)

        try:
            # Save CODE_MAP.json
            code_map_file = job_dir / "CODE_MAP.json"
            code_map_file.write_text(json.dumps(code_map, indent=2))
            logger.debug("Saved CODE_MAP.json for job %s", job_id)

            # Save diagrams
            for diagram_type, diagram_content in diagrams.items():
                diagram_file = job_dir / f"{diagram_type}.mermaid"
                diagram_file.write_text(diagram_content)
                logger.debug("Saved %s diagram for job %s", diagram_type, job_id)

        except IOError as exc:
            logger.error("Failed to save results for job %s: %s", job_id, exc)
            raise

    def get_code_map(self, job_id: str) -> dict[str, object]:
        """Retrieve CODE_MAP.json for a job.

        Args:
            job_id: Unique job identifier.

        Returns:
            Parsed CODE_MAP.json content as dictionary.

        Raises:
            FileNotFoundError: If CODE_MAP.json does not exist for the job.
            json.JSONDecodeError: If CODE_MAP.json is malformed.

        Example:
            >>> code_map = storage.get_code_map("abc12345")
            >>> print(code_map["version"])
            1.0
        """
        code_map_file = self.get_job_dir(job_id) / "CODE_MAP.json"

        if not code_map_file.exists():
            logger.warning("CODE_MAP.json not found for job %s", job_id)
            raise FileNotFoundError(f"CODE_MAP not found for job {job_id}")

        try:
            content = code_map_file.read_text()
            result = json.loads(content)
            assert isinstance(result, dict)
            return result
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse CODE_MAP.json for job %s: %s", job_id, exc)
            raise

    def get_diagram(self, job_id: str, diagram_type: str) -> str:
        """Retrieve a Mermaid diagram for a job.

        Args:
            job_id: Unique job identifier.
            diagram_type: Type of diagram (e.g., 'module', 'function', 'impact').

        Returns:
            Mermaid diagram content as string.

        Raises:
            FileNotFoundError: If diagram file does not exist for the job.

        Example:
            >>> diagram = storage.get_diagram("abc12345", "module")
            >>> print(diagram[:20])
            graph TD
        """
        diagram_file = self.get_job_dir(job_id) / f"{diagram_type}.mermaid"

        if not diagram_file.exists():
            logger.warning("Diagram %s not found for job %s", diagram_type, job_id)
            raise FileNotFoundError(f"Diagram {diagram_type} not found for job {job_id}")

        return diagram_file.read_text()

    def list_jobs(self) -> list[str]:
        """List all stored job IDs.

        Returns:
            List of job IDs with stored results. Empty list if no results
            directory exists or is empty.

        Example:
            >>> jobs = storage.list_jobs()
            >>> print(jobs)
            ['abc12345', 'def67890']
        """
        if not self._base_dir.exists():
            return []

        jobs = []
        for item in self._base_dir.iterdir():
            if item.is_dir():
                jobs.append(item.name)
                logger.debug("Found stored job: %s", item.name)

        return sorted(jobs)

    def delete_results(self, job_id: str) -> bool:
        """Delete all results for a job.

        Recursively removes the job's result directory including all files.

        Args:
            job_id: Unique job identifier.

        Returns:
            True if deletion succeeded, False if job directory didn't exist.

        Raises:
            OSError: If unable to delete due to filesystem permissions.

        Example:
            >>> deleted = storage.delete_results("abc12345")
            >>> print(deleted)
            True
        """
        job_dir = self.get_job_dir(job_id)

        if not job_dir.exists():
            logger.debug("Cannot delete job %s: directory does not exist", job_id)
            return False

        try:
            shutil.rmtree(job_dir)
            logger.info("Deleted results for job %s", job_id)
            return True
        except OSError as exc:
            logger.error("Failed to delete results for job %s: %s", job_id, exc)
            raise

    def job_exists(self, job_id: str) -> bool:
        """Check if a job has stored results.

        Args:
            job_id: Unique job identifier.

        Returns:
            True if job result directory exists, False otherwise.
        """
        return self.get_job_dir(job_id).exists()

    def get_job_metadata(self, job_id: str) -> Optional[dict[str, object]]:
        """Retrieve stored job metadata.

        Reads a metadata file if it exists. This allows storing job metadata
        separately from analysis results for potential future use.

        Args:
            job_id: Unique job identifier.

        Returns:
            Parsed metadata JSON if it exists, None otherwise.

        Raises:
            json.JSONDecodeError: If metadata file is malformed.

        Note:
            This method is provided for extensibility. Currently, metadata
            is stored in memory in JobManager.
        """
        metadata_file = self.get_job_dir(job_id) / "metadata.json"

        if not metadata_file.exists():
            return None

        try:
            content = metadata_file.read_text()
            result = json.loads(content)
            assert isinstance(result, dict)
            return result
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse metadata.json for job %s: %s", job_id, exc)
            raise

    def save_job_metadata(self, job_id: str, metadata: dict[str, object]) -> None:
        """Save job metadata to disk.

        Args:
            job_id: Unique job identifier.
            metadata: Metadata content as dictionary.

        Raises:
            IOError: If unable to write to filesystem.

        Note:
            This method is provided for extensibility. Currently, metadata
            is stored in memory in JobManager.
        """
        job_dir = self.get_job_dir(job_id)
        job_dir.mkdir(parents=True, exist_ok=True)

        try:
            metadata_file = job_dir / "metadata.json"
            metadata_file.write_text(json.dumps(metadata, indent=2))
            logger.debug("Saved metadata for job %s", job_id)
        except IOError as exc:
            logger.error("Failed to save metadata for job %s: %s", job_id, exc)
            raise
