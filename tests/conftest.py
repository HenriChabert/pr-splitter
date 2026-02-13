import os
from pathlib import Path

import pytest
from git import Repo


@pytest.fixture
def tmp_git_repo(tmp_path: Path) -> Repo:
    """Create a temporary git repo with a main branch and a feature branch with changes."""
    repo = Repo.init(tmp_path)
    repo.config_writer().set_value("user", "name", "Test").release()
    repo.config_writer().set_value("user", "email", "test@test.com").release()

    # Create initial commit on main
    readme = tmp_path / "README.md"
    readme.write_text("# Test Repo\n")
    repo.index.add(["README.md"])
    repo.index.commit("Initial commit")

    # Create main branch explicitly if needed
    if repo.active_branch.name != "main":
        repo.active_branch.rename("main")

    # Create feature branch with changes
    repo.create_head("feature/test")
    repo.heads["feature/test"].checkout()

    # Add files
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "foo.py").write_text("print('foo')\n")
    (tmp_path / "src" / "bar.py").write_text("print('bar')\n")
    (tmp_path / "src" / "baz.py").write_text("print('baz')\n")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_foo.py").write_text("def test_foo(): pass\n")

    repo.index.add(
        ["src/foo.py", "src/bar.py", "src/baz.py", "tests/test_foo.py"]
    )
    repo.index.commit("Add source files")

    return repo


@pytest.fixture
def clean_git_repo(tmp_git_repo: Repo) -> Repo:
    """A clean git repo on the feature branch (no uncommitted changes)."""
    return tmp_git_repo
