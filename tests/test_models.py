import pytest
from pydantic import ValidationError

from pr_splitter.models import CreatedPr, FileDiff, PrGroup, SplitConfig, SplitResult


class TestSplitConfig:
    def test_defaults(self) -> None:
        config = SplitConfig(num_prs=2)
        assert config.base_branch == "main"
        assert config.source_branch is None
        assert config.file_patterns == ["**/*"]
        assert config.exclude_patterns == []
        assert config.draft is True
        assert config.push is True

    def test_num_prs_must_be_positive(self) -> None:
        with pytest.raises(ValidationError):
            SplitConfig(num_prs=0)
        with pytest.raises(ValidationError):
            SplitConfig(num_prs=-1)

    def test_source_and_base_must_differ(self) -> None:
        with pytest.raises(ValidationError, match="source_branch and base_branch must be different"):
            SplitConfig(num_prs=2, base_branch="main", source_branch="main")


class TestFileDiff:
    def test_basic(self) -> None:
        f = FileDiff(path="src/foo.py", status="A")
        assert f.path == "src/foo.py"
        assert f.status == "A"
        assert f.old_path is None

    def test_rename(self) -> None:
        f = FileDiff(path="new.py", status="R", old_path="old.py")
        assert f.old_path == "old.py"

    def test_invalid_status(self) -> None:
        with pytest.raises(ValidationError):
            FileDiff(path="foo.py", status="X")


class TestPrGroup:
    def test_basic(self) -> None:
        group = PrGroup(
            index=0,
            branch_name="feat-part-1-of-2",
            files=[FileDiff(path="a.py", status="A")],
            title="[1/2] feat",
            body="Part 1",
        )
        assert group.index == 0
        assert len(group.files) == 1


class TestSplitResult:
    def test_basic(self) -> None:
        result = SplitResult(groups=[], source_branch="feat", base_branch="main")
        assert result.warnings == []
        assert result.groups == []


class TestCreatedPr:
    def test_basic(self) -> None:
        pr = CreatedPr(
            number=42,
            url="https://github.com/org/repo/pull/42",
            branch_name="feat-part-1",
            title="[1/2] feat",
        )
        assert pr.number == 42
