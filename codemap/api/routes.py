"""API route handlers for CodeMap service."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from codemap.api.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    CodeMapResponse,
    JobResponse,
    JobStatus,
    MermaidDiagramResponse,
)
from codemap.logging_config import get_logger

if TYPE_CHECKING:
    from codemap.api.jobs import JobManager

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1", tags=["codemap"])

# Global job manager instance (set by main.py)
_job_manager: JobManager | None = None


def set_job_manager(job_manager: JobManager) -> None:
    """Set the global job manager instance.

    Args:
        job_manager: JobManager instance to use for API operations.
    """
    global _job_manager
    _job_manager = job_manager


def get_job_manager() -> JobManager:
    """Get the global job manager instance.

    Returns:
        JobManager instance.

    Raises:
        RuntimeError: If job manager is not initialized.
    """
    if _job_manager is None:
        raise RuntimeError("Job manager not initialized")
    return _job_manager


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start code analysis",
    description="Create a new analysis job for the specified repository.",
)
async def analyze(
    request: AnalyzeRequest,
    background_tasks: BackgroundTasks,
) -> AnalyzeResponse:
    """Start a new code analysis job.

    Accepts a Git repository URL and starts background analysis. Returns
    immediately with a job ID that can be used to retrieve results.

    Args:
        request: AnalyzeRequest containing repo_url and optional branch.
        background_tasks: FastAPI BackgroundTasks to schedule job execution.

    Returns:
        AnalyzeResponse with job_id, status, and creation timestamp.

    Raises:
        HTTPException: If job creation fails.
    """
    try:
        job_manager = get_job_manager()
        job = job_manager.create_job(str(request.repo_url), request.branch)
        logger.info(
            "Created analysis job %s for repository %s branch %s",
            job.id,
            request.repo_url,
            request.branch,
        )

        # Schedule job execution in background
        background_tasks.add_task(job_manager.run_job, job.id)
        logger.debug("Scheduled background job execution for job %s", job.id)

        return AnalyzeResponse(
            job_id=job.id,
            status=job.status,
            created_at=job.created_at,
        )
    except Exception as exc:
        logger.error("Failed to create analysis job: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create analysis job",
        ) from exc


@router.get(
    "/results/{job_id}",
    response_model=JobResponse,
    summary="Get job status and results",
    description="Retrieve status, metadata, and error information for a job.",
)
async def get_job_status(job_id: str) -> JobResponse:
    """Get the status and results of an analysis job.

    Args:
        job_id: Unique job identifier.

    Returns:
        JobResponse with job status, metadata, and any error information.

    Raises:
        HTTPException: If job not found.
    """
    try:
        job_manager = get_job_manager()
        job = job_manager.get_job(job_id)

        if job is None:
            logger.warning("Job not found: %s", job_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job {job_id} not found",
            )

        return JobResponse(
            job_id=job.id,
            status=job.status,
            repo_url=job.repo_url,
            created_at=job.created_at,
            completed_at=job.completed_at,
            error=job.error,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to retrieve job %s: %s", job_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve job status",
        ) from exc


@router.get(
    "/results/{job_id}/graph",
    response_model=MermaidDiagramResponse,
    summary="Get Mermaid diagram for job",
    description="Retrieve a Mermaid diagram visualization of the code dependency graph.",
)
async def get_job_graph(
    job_id: str,
    diagram_type: str = "module",
) -> MermaidDiagramResponse:
    """Get a Mermaid diagram for a completed analysis job.

    Supported diagram types: module, function, impact.

    Args:
        job_id: Unique job identifier.
        diagram_type: Type of diagram to retrieve (default: module).

    Returns:
        MermaidDiagramResponse with diagram content.

    Raises:
        HTTPException: If job not found or not completed.
    """
    try:
        job_manager = get_job_manager()
        job = job_manager.get_job(job_id)

        if job is None:
            logger.warning("Job not found: %s", job_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job {job_id} not found",
            )

        if job.status != JobStatus.COMPLETED:
            logger.warning(
                "Cannot get graph for job %s: status is %s",
                job_id,
                job.status,
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Job is {job.status}, not completed",
            )

        # Try to get diagram from storage
        try:
            diagram_content = job_manager.get_diagram(job_id, diagram_type)
        except FileNotFoundError as exc:
            logger.error("Diagram not found for job %s type %s", job_id, diagram_type)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Diagram {diagram_type} not found for job {job_id}",
            ) from exc

        return MermaidDiagramResponse(
            diagram_type=diagram_type,
            content=diagram_content,
            job_id=job_id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to retrieve graph for job %s: %s", job_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve diagram",
        ) from exc


@router.get(
    "/results/{job_id}/codemap",
    response_model=CodeMapResponse,
    summary="Get CODE_MAP.json for job",
    description="Retrieve the CODE_MAP.json output for a completed analysis job.",
)
async def get_job_codemap(job_id: str) -> CodeMapResponse:
    """Get the CODE_MAP.json for a completed analysis job.

    Args:
        job_id: Unique job identifier.

    Returns:
        CodeMapResponse with CODE_MAP.json content.

    Raises:
        HTTPException: If job not found or not completed.
    """
    try:
        job_manager = get_job_manager()
        job = job_manager.get_job(job_id)

        if job is None:
            logger.warning("Job not found: %s", job_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job {job_id} not found",
            )

        if job.status != JobStatus.COMPLETED:
            logger.warning(
                "Cannot get codemap for job %s: status is %s",
                job_id,
                job.status,
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Job is {job.status}, not completed",
            )

        # Try to get code map from storage
        try:
            code_map_data = job_manager.get_code_map(job_id)
        except FileNotFoundError as exc:
            logger.error("CODE_MAP not found for job %s", job_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"CODE_MAP not found for job {job_id}",
            ) from exc

        version = code_map_data.get("version", "1.0")
        files = code_map_data.get("files", {})
        assert isinstance(version, str)
        assert isinstance(files, dict)

        return CodeMapResponse(
            job_id=job_id,
            version=version,
            files=files,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to retrieve codemap for job %s: %s", job_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve CODE_MAP",
        ) from exc
