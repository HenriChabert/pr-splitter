from pathlib import Path

import pytest
from git import Repo

from pr_splitter.errors import GitError
from pr_splitter.git_ops import (
    branch_exists,
    create_branch_with_files,
    get_changed_files,
    get_current_branch,
    open_repo,
    validate_repo_state,
)
from pr_splitter.models import FileDiff


class TestOpenRepo:
    def test_valid_repo(self, clean_git_repo: Repo) -> None:
        repo = open_repo(str(clean_git_repo.working_dir))
        assert repo.working_dir == clean_git_repo.working_dir

    def test_invalid_path(self, tmp_path: object) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            with pytest.raises(GitError, match="Not a git repository"):
                open_repo(d)


class TestValidateRepoState:
    def test_clean_repo(self, clean_git_repo: Repo) -> None:
        validate_repo_state(clean_git_repo, "main")

    def test_dirty_repo(self, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        Path(clean_git_repo.working_dir, "dirty.txt").write_text("dirty")
        with pytest.raises(GitError, match="not clean"):
            validate_repo_state(clean_git_repo, "main")

    def test_nonexistent_base(self, clean_git_repo: Repo) -> None:
        with pytest.raises(GitError, match="does not exist"):
            validate_repo_state(clean_git_repo, "nonexistent")

    def test_on_base_branch(self, clean_git_repo: Repo) -> None:
        clean_git_repo.heads["main"].checkout()
        with pytest.raises(GitError, match="Currently on base branch"):
            validate_repo_state(clean_git_repo, "main")


class TestGetCurrentBranch:
    def test_on_feature(self, clean_git_repo: Repo) -> None:
        assert get_current_branch(clean_git_repo) == "feature/test"


class TestGetChangedFiles:
    def test_finds_changes(self, clean_git_repo: Repo) -> None:
        files = get_changed_files(clean_git_repo, "main")
        paths = {f.path for f in files}
        assert paths == {"src/foo.py", "src/bar.py", "src/baz.py", "tests/test_foo.py"}

    def test_all_are_added(self, clean_git_repo: Repo) -> None:
        files = get_changed_files(clean_git_repo, "main")
        assert all(f.status == "A" for f in files)


class TestCreateBranchWithFiles:
    def test_creates_branch(self, clean_git_repo: Repo) -> None:
        files = [FileDiff(path="src/foo.py", status="A")]
        create_branch_with_files(
            clean_git_repo, "split-part-1", "main", "feature/test", files
        )
        assert branch_exists(clean_git_repo, "split-part-1")
        # Verify we're back on original branch
        assert get_current_branch(clean_git_repo) == "feature/test"

    def test_branch_contains_only_specified_files(self, clean_git_repo: Repo) -> None:
        files = [FileDiff(path="src/foo.py", status="A")]
        create_branch_with_files(
            clean_git_repo, "split-part-1", "main", "feature/test", files
        )

        # Check branch contents
        clean_git_repo.heads["split-part-1"].checkout()
        assert clean_git_repo.working_dir is not None
        from pathlib import Path

        repo_path = Path(clean_git_repo.working_dir)
        assert (repo_path / "src" / "foo.py").exists()
        assert not (repo_path / "src" / "bar.py").exists()

        # Go back
        clean_git_repo.heads["feature/test"].checkout()


class TestBranchExists:
    def test_existing_branch(self, clean_git_repo: Repo) -> None:
        assert branch_exists(clean_git_repo, "main")
        assert branch_exists(clean_git_repo, "feature/test")

    def test_nonexistent_branch(self, clean_git_repo: Repo) -> None:
        assert not branch_exists(clean_git_repo, "nonexistent")
