from unittest.mock import patch

from click.testing import CliRunner
from git import Repo

from pr_splitter.cli import main, parse_group_option, parse_title_option


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
    @patch("pr_splitter.splitter.get_current_pr_info", return_value={})
    def test_dry_run(self, _mock: object, clean_git_repo: Repo) -> None:
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

    @patch("pr_splitter.splitter.get_current_pr_info", return_value={})
    def test_dry_run_with_filters(self, _mock: object, clean_git_repo: Repo) -> None:
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


class TestParseOptions:
    def test_parse_group_option(self) -> None:
        result = parse_group_option(("1:src/**", "1:lib/**", "2:tests/**"))
        assert result == {1: ["src/**", "lib/**"], 2: ["tests/**"]}

    def test_parse_title_option(self) -> None:
        result = parse_title_option(("1:Models", "2:API endpoints"))
        assert result == {1: "Models", 2: "API endpoints"}

    def test_parse_group_option_invalid_format(self) -> None:
        import click

        with __import__("pytest").raises(click.exceptions.BadParameter):
            parse_group_option(("invalid",))

    def test_parse_title_option_invalid_group(self) -> None:
        import click

        with __import__("pytest").raises(click.exceptions.BadParameter):
            parse_title_option(("abc:Title",))


class TestCliSplitWithAssign:
    @patch("pr_splitter.splitter.get_current_pr_info", return_value={})
    def test_assign_dry_run(self, _mock: object, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        runner = CliRunner()
        with runner.isolated_filesystem(temp_dir=clean_git_repo.working_dir):
            result = runner.invoke(
                main,
                [
                    "split",
                    "--num-prs",
                    "2",
                    "--assign",
                    "1:src/**",
                    "--assign",
                    "2:tests/**",
                    "--dry-run",
                ],
            )
        assert result.exit_code == 0
        assert "Split plan" in result.output

    @patch("pr_splitter.splitter.get_current_pr_info", return_value={})
    def test_title_dry_run(self, _mock: object, clean_git_repo: Repo) -> None:
        assert clean_git_repo.working_dir is not None
        runner = CliRunner()
        with runner.isolated_filesystem(temp_dir=clean_git_repo.working_dir):
            result = runner.invoke(
                main,
                [
                    "split",
                    "--num-prs",
                    "2",
                    "--title",
                    "1:Models",
                    "--title",
                    "2:Tests",
                    "--dry-run",
                ],
            )
        assert result.exit_code == 0
        assert "Models" in result.output
        assert "Tests" in result.output


class TestCliSplitExecute:
    @patch("pr_splitter.splitter.get_current_pr_info", return_value={})
    def test_create_branches_no_push(self, _mock: object, clean_git_repo: Repo) -> None:
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
