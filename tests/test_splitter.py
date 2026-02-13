from unittest.mock import patch

import pytest
from git import Repo

from pr_splitter.errors import ValidationError
from pr_splitter.git_ops import branch_exists
from pr_splitter.models import FileDiff, SplitConfig
from pr_splitter.splitter import (
    assign_files,
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


class TestAssignFiles:
    def make_files(self, paths: list[str]) -> list[FileDiff]:
        return [FileDiff(path=p, status="A") for p in paths]

    def test_basic_assignment(self) -> None:
        files = self.make_files(["src/a.py", "src/b.py", "tests/c.py"])
        groups = assign_files(files, {1: ["src/**"], 2: ["tests/**"]}, 2)
        assert len(groups) == 2
        assert [f.path for f in groups[0]] == ["src/a.py", "src/b.py"]
        assert [f.path for f in groups[1]] == ["tests/c.py"]

    def test_leftover_group(self) -> None:
        files = self.make_files(["src/a.py", "docs/b.md", "tests/c.py"])
        groups = assign_files(files, {1: ["src/**"]}, 1)
        assert len(groups) == 2  # 1 assigned + 1 leftover
        assert [f.path for f in groups[0]] == ["src/a.py"]
        assert [f.path for f in groups[1]] == ["docs/b.md", "tests/c.py"]

    def test_first_match_wins(self) -> None:
        files = self.make_files(["src/a.py"])
        # Both groups match src/a.py, group 1 should win
        groups = assign_files(files, {1: ["**/*.py"], 2: ["src/**"]}, 2)
        assert len(groups) == 1
        assert groups[0][0].path == "src/a.py"

    def test_no_leftover_when_all_assigned(self) -> None:
        files = self.make_files(["a.py", "b.py"])
        groups = assign_files(files, {1: ["a.py"], 2: ["b.py"]}, 2)
        assert len(groups) == 2

    def test_empty_groups_removed(self) -> None:
        files = self.make_files(["src/a.py"])
        groups = assign_files(files, {1: ["src/**"], 2: ["tests/**"]}, 2)
        assert len(groups) == 1  # Group 2 is empty, removed


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

    def test_leftover(self) -> None:
        name = generate_branch_name("feature/test", "", 3, 4, is_leftover=True)
        assert name == "feature/test-part-leftover-of-4"


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

    def test_source_body_prepended(self) -> None:
        from pr_splitter.models import PrGroup

        group = PrGroup(
            index=0,
            branch_name="test-part-1",
            files=[FileDiff(path="a.py", status="A")],
            title="[1/2] test",
            body="",
        )
        body = build_pr_body(group, 2, "test", source_body="Original PR description")
        assert body.startswith("Original PR description")
        assert "---" in body
        assert "`a.py`" in body


class TestSplit:
    @patch("pr_splitter.splitter.get_current_pr_info", return_value={})
    def test_split_plan(self, _mock: object, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        config = SplitConfig(
            num_prs=2,
            repo_path=clean_git_repo.working_dir,  # type: ignore[arg-type]
        )
        result = split(config)
        assert len(result.groups) == 2
        total_files = sum(len(g.files) for g in result.groups)
        assert total_files == 4

    @patch("pr_splitter.splitter.get_current_pr_info", return_value={})
    def test_split_with_filter(self, _mock: object, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        config = SplitConfig(
            num_prs=2,
            file_patterns=["src/**/*.py"],
            repo_path=clean_git_repo.working_dir,  # type: ignore[arg-type]
        )
        result = split(config)
        total_files = sum(len(g.files) for g in result.groups)
        assert total_files == 3  # Only src/ files

    @patch("pr_splitter.splitter.get_current_pr_info", return_value={})
    def test_split_warns_on_excess_prs(self, _mock: object, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        config = SplitConfig(
            num_prs=10,
            repo_path=clean_git_repo.working_dir,  # type: ignore[arg-type]
        )
        result = split(config)
        assert len(result.warnings) == 1
        assert len(result.groups) == 4  # One per file

    @patch("pr_splitter.splitter.get_current_pr_info", return_value={})
    def test_split_with_assignments(self, _mock: object, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        config = SplitConfig(
            num_prs=2,
            assignments={1: ["src/**"], 2: ["tests/**"]},
            repo_path=clean_git_repo.working_dir,  # type: ignore[arg-type]
        )
        result = split(config)
        assert len(result.groups) == 2
        src_files = [f.path for f in result.groups[0].files]
        assert all(f.startswith("src/") for f in src_files)
        test_files = [f.path for f in result.groups[1].files]
        assert all(f.startswith("tests/") for f in test_files)

    @patch("pr_splitter.splitter.get_current_pr_info", return_value={})
    def test_split_with_assignments_leftover(self, _mock: object, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        config = SplitConfig(
            num_prs=1,
            assignments={1: ["src/foo.py"]},
            repo_path=clean_git_repo.working_dir,  # type: ignore[arg-type]
        )
        result = split(config)
        assert len(result.groups) == 2  # 1 assigned + 1 leftover
        assert any("leftover" in g.branch_name for g in result.groups)
        assert len(result.warnings) == 1

    @patch("pr_splitter.splitter.get_current_pr_info", return_value={"title": "My Feature", "body": ""})
    def test_split_uses_pr_title(self, _mock: object, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        config = SplitConfig(
            num_prs=2,
            repo_path=clean_git_repo.working_dir,  # type: ignore[arg-type]
        )
        result = split(config)
        assert "My Feature" in result.groups[0].title

    @patch("pr_splitter.splitter.get_current_pr_info", return_value={})
    def test_split_custom_titles(self, _mock: object, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        config = SplitConfig(
            num_prs=2,
            titles={1: "Models", 2: "Tests"},
            repo_path=clean_git_repo.working_dir,  # type: ignore[arg-type]
        )
        result = split(config)
        assert "Models" in result.groups[0].title
        assert "Tests" in result.groups[1].title

    @patch("pr_splitter.splitter.get_current_pr_info", return_value={"title": "My PR", "body": "Original description"})
    def test_split_copies_source_body(self, _mock: object, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        config = SplitConfig(
            num_prs=2,
            repo_path=clean_git_repo.working_dir,  # type: ignore[arg-type]
        )
        result = split(config)
        for group in result.groups:
            assert "Original description" in group.body


class TestExecuteSplit:
    @patch("pr_splitter.splitter.get_current_pr_info", return_value={})
    def test_creates_branches(self, _mock: object, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        config = SplitConfig(
            num_prs=2,
            repo_path=clean_git_repo.working_dir,  # type: ignore[arg-type]
        )
        result = split(config)
        execute_split(config, result)

        for group in result.groups:
            assert branch_exists(clean_git_repo, group.branch_name)
