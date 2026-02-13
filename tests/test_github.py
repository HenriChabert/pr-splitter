from unittest.mock import MagicMock, patch

import pytest

from pr_splitter.errors import GitHubError
from pr_splitter.github import check_gh_available, create_pr
from pr_splitter.models import FileDiff, PrGroup


class TestCheckGhAvailable:
    @patch("pr_splitter.github.subprocess.run")
    def test_available(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(returncode=0)
        check_gh_available()  # Should not raise

    @patch("pr_splitter.github.subprocess.run", side_effect=FileNotFoundError)
    def test_not_installed(self, mock_run: MagicMock) -> None:
        with pytest.raises(GitHubError, match="not installed"):
            check_gh_available()

    @patch(
        "pr_splitter.github.subprocess.run",
        side_effect=__import__("subprocess").CalledProcessError(1, "gh"),
    )
    def test_not_authenticated(self, mock_run: MagicMock) -> None:
        with pytest.raises(GitHubError, match="Not authenticated"):
            check_gh_available()


class TestCreatePr:
    @patch("pr_splitter.github.subprocess.run")
    def test_creates_pr(self, mock_run: MagicMock) -> None:
        mock_run.return_value = MagicMock(
            stdout="https://github.com/org/repo/pull/42\n",
            returncode=0,
        )
        group = PrGroup(
            index=0,
            branch_name="feat-part-1",
            files=[FileDiff(path="a.py", status="A")],
            title="[1/2] feat",
            body="Part 1",
        )
        pr = create_pr(group, "main", True, "/tmp/repo")
        assert pr.number == 42
        assert pr.url == "https://github.com/org/repo/pull/42"

    @patch(
        "pr_splitter.github.subprocess.run",
        side_effect=__import__("subprocess").CalledProcessError(1, "gh", stderr="error"),
    )
    def test_create_pr_failure(self, mock_run: MagicMock) -> None:
        group = PrGroup(
            index=0,
            branch_name="feat-part-1",
            files=[FileDiff(path="a.py", status="A")],
            title="[1/2] feat",
            body="Part 1",
        )
        with pytest.raises(GitHubError, match="Failed to create PR"):
            create_pr(group, "main", True, "/tmp/repo")
