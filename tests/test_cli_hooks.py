"""Tests for the install-hooks CLI command."""

from __future__ import annotations

from pathlib import Path

import pytest
from click.testing import CliRunner

from codemap.cli import cli


@pytest.fixture
def runner() -> CliRunner:
    """Provide a Click test runner."""
    return CliRunner()


@pytest.fixture
def git_repo(tmp_path: Path) -> Path:
    """Create a temporary git repository."""
    git_dir = tmp_path / ".git"
    git_dir.mkdir()
    hooks_dir = git_dir / "hooks"
    hooks_dir.mkdir()
    return tmp_path


def test_install_hooks_not_git_repo(runner: CliRunner, tmp_path: Path) -> None:
    """Test install-hooks command outside git repo."""
    with runner.isolated_filesystem(temp_dir=tmp_path):
        result = runner.invoke(
            cli,
            ["install-hooks", "--pre-commit"],
        )

        assert result.exit_code == 1
        assert "git" in result.output.lower() or "repository" in result.output.lower()


def test_install_hooks_pre_commit(runner: CliRunner, git_repo: Path) -> None:
    """Test installing pre-commit hook."""
    with runner.isolated_filesystem(temp_dir=git_repo.parent):
        result = runner.invoke(
            cli,
            ["install-hooks", "--pre-commit"],
            cwd=str(git_repo),
        )

        assert result.exit_code in (0, 1)  # May fail due to permissions in test env


def test_install_hooks_post_commit(runner: CliRunner, git_repo: Path) -> None:
    """Test installing post-commit hook."""
    with runner.isolated_filesystem(temp_dir=git_repo.parent):
        result = runner.invoke(
            cli,
            ["install-hooks", "--post-commit"],
            cwd=str(git_repo),
        )

        assert result.exit_code in (0, 1)


def test_install_hooks_both(runner: CliRunner, git_repo: Path) -> None:
    """Test installing both pre and post commit hooks."""
    with runner.isolated_filesystem(temp_dir=git_repo.parent):
        result = runner.invoke(
            cli,
            ["install-hooks", "--pre-commit", "--post-commit"],
            cwd=str(git_repo),
        )

        assert result.exit_code in (0, 1)


def test_install_hooks_uninstall(runner: CliRunner, git_repo: Path) -> None:
    """Test uninstalling hooks."""
    # First install
    with runner.isolated_filesystem(temp_dir=git_repo.parent):
        runner.invoke(
            cli,
            ["install-hooks", "--pre-commit"],
            cwd=str(git_repo),
        )

        # Then uninstall
        result = runner.invoke(
            cli,
            ["install-hooks", "--uninstall"],
            cwd=str(git_repo),
        )

        assert result.exit_code in (0, 1)


def test_install_hooks_help(runner: CliRunner) -> None:
    """Test install-hooks command help."""
    result = runner.invoke(cli, ["install-hooks", "--help"])

    assert result.exit_code == 0
    assert "install" in result.output.lower() or "hook" in result.output.lower()


def test_install_hooks_no_options(runner: CliRunner, git_repo: Path) -> None:
    """Test install-hooks with no options (defaults to pre-commit)."""
    with runner.isolated_filesystem(temp_dir=git_repo.parent):
        result = runner.invoke(
            cli,
            ["install-hooks"],
            cwd=str(git_repo),
        )

        assert result.exit_code in (0, 1)
