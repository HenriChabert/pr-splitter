import pytest
from git import Repo

from pr_splitter.errors import ValidationError
from pr_splitter.git_ops import branch_exists
from pr_splitter.models import FileDiff, SplitConfig
from pr_splitter.splitter import (
    build_pr_body,
    distribute_files,
    execute_split,
    filter_files,
    generate_branch_name,
    split,
)


class TestFilterFiles:
    def make_files(self, paths: list[str]) -> list[FileDiff]:
        return [FileDiff(path=p, status="A") for p in paths]

    def test_include_pattern(self) -> None:
        files = self.make_files(["src/a.py", "src/b.js", "tests/c.py"])
        result = filter_files(files, ["**/*.py"], [])
        assert [f.path for f in result] == ["src/a.py", "tests/c.py"]

    def test_exclude_pattern(self) -> None:
        files = self.make_files(["src/a.py", "tests/c.py", "tests/d.py"])
        result = filter_files(files, ["**/*"], ["tests/**"])
        assert [f.path for f in result] == ["src/a.py"]

    def test_include_and_exclude(self) -> None:
        files = self.make_files(["src/a.py", "src/b.js", "tests/c.py"])
        result = filter_files(files, ["**/*.py"], ["tests/**"])
        assert [f.path for f in result] == ["src/a.py"]

    def test_no_patterns_returns_all(self) -> None:
        files = self.make_files(["a.py", "b.js"])
        result = filter_files(files, [], [])
        assert len(result) == 2


class TestDistributeFiles:
    def make_files(self, paths: list[str]) -> list[FileDiff]:
        return [FileDiff(path=p, status="A") for p in paths]

    def test_even_distribution(self) -> None:
        files = self.make_files(["a.py", "b.py", "c.py", "d.py"])
        groups = distribute_files(files, 2)
        assert len(groups) == 2
        assert len(groups[0]) == 2
        assert len(groups[1]) == 2

    def test_uneven_distribution(self) -> None:
        files = self.make_files(["a.py", "b.py", "c.py"])
        groups = distribute_files(files, 2)
        assert len(groups) == 2
        assert len(groups[0]) == 2  # a.py, c.py
        assert len(groups[1]) == 1  # b.py

    def test_more_prs_than_files(self) -> None:
        files = self.make_files(["a.py", "b.py"])
        groups = distribute_files(files, 5)
        assert len(groups) == 2  # Empty groups removed

    def test_sorted_alphabetically(self) -> None:
        files = self.make_files(["c.py", "a.py", "b.py"])
        groups = distribute_files(files, 3)
        assert groups[0][0].path == "a.py"
        assert groups[1][0].path == "b.py"
        assert groups[2][0].path == "c.py"


class TestGenerateBranchName:
    def test_basic(self) -> None:
        name = generate_branch_name("feature/test", "", 0, 3)
        assert name == "feature/test-part-1-of-3"

    def test_with_prefix(self) -> None:
        name = generate_branch_name("test", "feat/", 0, 2)
        assert name == "feat/test-part-1-of-2"

    def test_prefix_already_present(self) -> None:
        name = generate_branch_name("feat/test", "feat/", 1, 2)
        assert name == "feat/test-part-2-of-2"


class TestBuildPrBody:
    def test_contains_file_list(self) -> None:
        from pr_splitter.models import PrGroup

        group = PrGroup(
            index=0,
            branch_name="test-part-1",
            files=[FileDiff(path="a.py", status="A")],
            title="[1/2] test",
            body="",
        )
        body = build_pr_body(group, 2, "test")
        assert "`a.py`" in body
        assert "added" in body
        assert "Part 1 of 2" in body

    def test_depends_on(self) -> None:
        from pr_splitter.models import PrGroup

        group = PrGroup(
            index=0,
            branch_name="test-part-1",
            files=[FileDiff(path="a.py", status="A")],
            title="[1/2] test",
            body="",
        )
        body = build_pr_body(group, 2, "test", depends_on="#123")
        assert "#123" in body


class TestSplit:
    def test_split_plan(self, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        config = SplitConfig(
            num_prs=2,
            repo_path=clean_git_repo.working_dir,  # type: ignore[arg-type]
        )
        result = split(config)
        assert len(result.groups) == 2
        total_files = sum(len(g.files) for g in result.groups)
        assert total_files == 4

    def test_split_with_filter(self, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        config = SplitConfig(
            num_prs=2,
            file_patterns=["src/**/*.py"],
            repo_path=clean_git_repo.working_dir,  # type: ignore[arg-type]
        )
        result = split(config)
        total_files = sum(len(g.files) for g in result.groups)
        assert total_files == 3  # Only src/ files

    def test_split_warns_on_excess_prs(self, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        config = SplitConfig(
            num_prs=10,
            repo_path=clean_git_repo.working_dir,  # type: ignore[arg-type]
        )
        result = split(config)
        assert len(result.warnings) == 1
        assert len(result.groups) == 4  # One per file


class TestExecuteSplit:
    def test_creates_branches(self, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        config = SplitConfig(
            num_prs=2,
            repo_path=clean_git_repo.working_dir,  # type: ignore[arg-type]
        )
        result = split(config)
        execute_split(config, result)

        for group in result.groups:
            assert branch_exists(clean_git_repo, group.branch_name)
