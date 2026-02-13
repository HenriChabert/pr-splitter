from pathlib import Path
from unittest.mock import patch

from click.testing import CliRunner
from git import Repo

from pr_splitter.cli import main


class TestCliHelp:
    def test_main_help(self) -> None:
        runner = CliRunner()
        result = runner.invoke(main, ["--help"])
        assert result.exit_code == 0
        assert "PR Splitter" in result.output

    def test_split_help(self) -> None:
        runner = CliRunner()
        result = runner.invoke(main, ["split", "--help"])
        assert result.exit_code == 0
        assert "--num-prs" in result.output
        assert "--dry-run" in result.output


class TestCliSplitDryRun:
    def test_dry_run(self, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        runner = CliRunner()
        with runner.isolated_filesystem(temp_dir=clean_git_repo.working_dir):
            result = runner.invoke(
                main,
                ["split", "--num-prs", "2", "--dry-run"],
            )
        assert result.exit_code == 0
        assert "Dry run" in result.output
        assert "Split plan" in result.output

    def test_dry_run_with_filters(self, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        runner = CliRunner()
        with runner.isolated_filesystem(temp_dir=clean_git_repo.working_dir):
            result = runner.invoke(
                main,
                [
                    "split",
                    "--num-prs",
                    "2",
                    "--files",
                    "src/**/*.py",
                    "--dry-run",
                ],
            )
        assert result.exit_code == 0
        assert "src/" in result.output


class TestCliSplitExecute:
    def test_create_branches_no_push(self, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        runner = CliRunner()
        with runner.isolated_filesystem(temp_dir=clean_git_repo.working_dir):
            result = runner.invoke(
                main,
                ["split", "--num-prs", "2", "--no-push"],
                input="y\n",
            )
        assert result.exit_code == 0
        assert "Branches created successfully" in result.output
