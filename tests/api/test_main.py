"""Tests for FastAPI application and routes."""

from __future__ import annotations

import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient
from pydantic import HttpUrl

from codemap.api.jobs import JobManager
from codemap.api.main import app
from codemap.api.models import JobStatus
from codemap.api.routes import set_job_manager
from codemap.api.storage import ResultsStorage

if TYPE_CHECKING:
    pass


@pytest.fixture
def client() -> TestClient:
    """Create a test client for the FastAPI app.

    Returns:
        TestClient configured for testing.
    """
    return TestClient(app)


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
    storage = ResultsStorage(temp_results_dir)
    manager = JobManager(storage)
    set_job_manager(manager)
    return manager


class TestHealthEndpoint:
    """Tests for health check endpoint."""

    def test_health_check_returns_200(self, client: TestClient) -> None:
        """Test that health endpoint returns 200 OK.

        Args:
            client: TestClient instance.
        """
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_check_response_format(self, client: TestClient) -> None:
        """Test that health endpoint returns correct JSON format.

        Args:
            client: TestClient instance.
        """
        response = client.get("/health")
        data = response.json()
        assert "status" in data
        assert data["status"] == "healthy"

    def test_root_endpoint(self, client: TestClient) -> None:
        """Test root endpoint returns welcome message.

        Args:
            client: TestClient instance.
        """
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["message"] == "CodeMap API"


class TestDocsEndpoint:
    """Tests for OpenAPI documentation endpoint."""

    def test_swagger_docs_available(self, client: TestClient) -> None:
        """Test that Swagger UI is available.

        Args:
            client: TestClient instance.
        """
        response = client.get("/docs")
        assert response.status_code == 200
        assert "swagger" in response.text.lower()

    def test_redoc_available(self, client: TestClient) -> None:
        """Test that ReDoc is available.

        Args:
            client: TestClient instance.
        """
        response = client.get("/redoc")
        assert response.status_code == 200


class TestAnalyzeEndpoint:
    """Tests for analyze endpoint."""

    def test_analyze_accepts_valid_request(
        self, client: TestClient, job_manager: JobManager
    ) -> None:
        """Test analyze endpoint with valid request.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        response = client.post(
            "/api/v1/analyze",
            json={
                "repo_url": "https://github.com/user/repo.git",
                "branch": "main",
            },
        )
        assert response.status_code == 202
        data = response.json()
        assert "job_id" in data
        assert data["status"] == "pending"
        assert "created_at" in data

    def test_analyze_default_branch(self, client: TestClient, job_manager: JobManager) -> None:
        """Test analyze endpoint uses default branch.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        response = client.post(
            "/api/v1/analyze",
            json={"repo_url": "https://github.com/user/repo.git"},
        )
        assert response.status_code == 202
        data = response.json()
        assert "job_id" in data

    def test_analyze_validates_repo_url(self, client: TestClient, job_manager: JobManager) -> None:
        """Test analyze endpoint validates repo URL.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        response = client.post(
            "/api/v1/analyze",
            json={"repo_url": "not-a-valid-url"},
        )
        assert response.status_code == 422

    def test_analyze_requires_repo_url(self, client: TestClient, job_manager: JobManager) -> None:
        """Test analyze endpoint requires repo URL.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        response = client.post("/api/v1/analyze", json={})
        assert response.status_code == 422

    def test_analyze_returns_unique_job_ids(
        self, client: TestClient, job_manager: JobManager
    ) -> None:
        """Test that multiple analyze requests return unique job IDs.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        response1 = client.post(
            "/api/v1/analyze",
            json={"repo_url": "https://github.com/user/repo1.git"},
        )
        response2 = client.post(
            "/api/v1/analyze",
            json={"repo_url": "https://github.com/user/repo2.git"},
        )

        data1 = response1.json()
        data2 = response2.json()

        assert data1["job_id"] != data2["job_id"]


class TestResultsEndpoint:
    """Tests for results endpoint."""

    def test_get_results_pending_job(self, client: TestClient, job_manager: JobManager) -> None:
        """Test getting results for pending job.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        # Create a job
        response = client.post(
            "/api/v1/analyze",
            json={"repo_url": "https://github.com/user/repo.git"},
        )
        job_id = response.json()["job_id"]

        # Get results
        response = client.get(f"/api/v1/results/{job_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["job_id"] == job_id
        # Note: BackgroundTasks runs immediately in TestClient, so job may be
        # pending, running, completed, or failed depending on timing
        assert data["status"] in ["pending", "running", "completed", "failed"]
        assert "github.com/user/repo.git" in data["repo_url"]

    def test_get_results_not_found(self, client: TestClient, job_manager: JobManager) -> None:
        """Test getting results for non-existent job.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        response = client.get("/api/v1/results/nonexistent")
        assert response.status_code == 404

    def test_get_results_with_error(self, client: TestClient, job_manager: JobManager) -> None:
        """Test getting results for failed job.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        # Create job and simulate failure
        job = job_manager.create_job("https://github.com/user/repo.git")
        job.status = JobStatus.FAILED
        job.error = "Repository not found"

        response = client.get(f"/api/v1/results/{job.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "failed"
        assert data["error"] == "Repository not found"


class TestGraphEndpoint:
    """Tests for graph endpoint."""

    def test_get_graph_not_found(self, client: TestClient, job_manager: JobManager) -> None:
        """Test getting graph for non-existent job.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        response = client.get("/api/v1/results/nonexistent/graph")
        assert response.status_code == 404

    def test_get_graph_pending_job(self, client: TestClient, job_manager: JobManager) -> None:
        """Test getting graph for pending job.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        # Create a job
        response = client.post(
            "/api/v1/analyze",
            json={"repo_url": "https://github.com/user/repo.git"},
        )
        job_id = response.json()["job_id"]

        # Try to get graph
        response = client.get(f"/api/v1/results/{job_id}/graph")
        assert response.status_code == 409

    def test_get_graph_completed_job_no_file(
        self, client: TestClient, job_manager: JobManager
    ) -> None:
        """Test getting graph for completed job with missing file.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        # Create job and mark as completed
        job = job_manager.create_job("https://github.com/user/repo.git")
        job.status = JobStatus.COMPLETED
        job.result_path = job_manager._storage.get_job_dir(job.id)
        job.result_path.mkdir(parents=True, exist_ok=True)

        # Try to get graph
        response = client.get(f"/api/v1/results/{job.id}/graph")
        assert response.status_code == 404

    def test_get_graph_diagram_type_parameter(
        self, client: TestClient, job_manager: JobManager
    ) -> None:
        """Test graph endpoint accepts diagram_type parameter.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        # Create job and mark as completed with diagram
        job = job_manager.create_job("https://github.com/user/repo.git")
        job.status = JobStatus.COMPLETED
        job.result_path = job_manager._storage.get_job_dir(job.id)
        job.result_path.mkdir(parents=True, exist_ok=True)

        # Write a diagram file
        diagram_file = job.result_path / "function.mermaid"
        diagram_file.write_text("graph TD\n  A[Start]\n  B[End]")

        response = client.get(f"/api/v1/results/{job.id}/graph?diagram_type=function")
        assert response.status_code == 200
        data = response.json()
        assert data["diagram_type"] == "function"
        assert "graph TD" in data["content"]


class TestCodemapEndpoint:
    """Tests for CODE_MAP endpoint."""

    def test_get_codemap_not_found(self, client: TestClient, job_manager: JobManager) -> None:
        """Test getting codemap for non-existent job.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        response = client.get("/api/v1/results/nonexistent/codemap")
        assert response.status_code == 404

    def test_get_codemap_pending_job(self, client: TestClient, job_manager: JobManager) -> None:
        """Test getting codemap for pending job.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        # Create a job
        response = client.post(
            "/api/v1/analyze",
            json={"repo_url": "https://github.com/user/repo.git"},
        )
        job_id = response.json()["job_id"]

        # Try to get codemap
        response = client.get(f"/api/v1/results/{job_id}/codemap")
        assert response.status_code == 409

    def test_get_codemap_completed_job(self, client: TestClient, job_manager: JobManager) -> None:
        """Test getting codemap for completed job.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        # Create job and mark as completed with CODE_MAP.json
        job = job_manager.create_job("https://github.com/user/repo.git")
        job.status = JobStatus.COMPLETED
        job.result_path = job_manager._storage.get_job_dir(job.id)
        job.result_path.mkdir(parents=True, exist_ok=True)

        # Write a CODE_MAP.json file
        code_map_file = job.result_path / "CODE_MAP.json"
        code_map_data = {
            "version": "1.0",
            "files": {
                "main.py": {
                    "symbols": ["main"],
                },
            },
        }
        code_map_file.write_text(json.dumps(code_map_data))

        response = client.get(f"/api/v1/results/{job.id}/codemap")
        assert response.status_code == 200
        data = response.json()
        assert data["job_id"] == job.id
        assert data["version"] == "1.0"
        assert "main.py" in data["files"]

    def test_get_codemap_missing_file(self, client: TestClient, job_manager: JobManager) -> None:
        """Test getting codemap for completed job with missing file.

        Args:
            client: TestClient instance.
            job_manager: JobManager fixture.
        """
        # Create job and mark as completed without CODE_MAP.json
        job = job_manager.create_job("https://github.com/user/repo.git")
        job.status = JobStatus.COMPLETED
        job.result_path = job_manager._storage.get_job_dir(job.id)
        job.result_path.mkdir(parents=True, exist_ok=True)

        response = client.get(f"/api/v1/results/{job.id}/codemap")
        assert response.status_code == 404


class TestOpenAPISchema:
    """Tests for OpenAPI schema."""

    def test_openapi_schema_includes_endpoints(self, client: TestClient) -> None:
        """Test that OpenAPI schema includes all endpoints.

        Args:
            client: TestClient instance.
        """
        response = client.get("/openapi.json")
        assert response.status_code == 200
        schema = response.json()

        paths = schema["paths"]
        assert "/health" in paths
        assert "/api/v1/analyze" in paths
        assert "/api/v1/results/{job_id}" in paths
        assert "/api/v1/results/{job_id}/graph" in paths
        assert "/api/v1/results/{job_id}/codemap" in paths

    def test_openapi_schema_has_info(self, client: TestClient) -> None:
        """Test that OpenAPI schema has proper info.

        Args:
            client: TestClient instance.
        """
        response = client.get("/openapi.json")
        schema = response.json()

        info = schema["info"]
        assert info["title"] == "CodeMap API"
        assert "version" in info


class TestModelValidation:
    """Tests for Pydantic model validation."""

    def test_analyze_request_validation(self) -> None:
        """Test AnalyzeRequest model validation."""
        from codemap.api.models import AnalyzeRequest

        # Valid request
        request = AnalyzeRequest(
            repo_url=HttpUrl("https://github.com/user/repo.git"),
            branch="main",
        )
        assert "github.com/user/repo.git" in str(request.repo_url)

    def test_analyze_response_validation(self) -> None:
        """Test AnalyzeResponse model validation."""
        from codemap.api.models import AnalyzeResponse, JobStatus

        response = AnalyzeResponse(
            job_id="abc123",
            status=JobStatus.PENDING,
            created_at=datetime.now(timezone.utc),
        )
        assert response.job_id == "abc123"
        assert response.status == JobStatus.PENDING
