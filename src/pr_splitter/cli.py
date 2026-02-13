from collections import defaultdict
from pathlib import Path

import click

from pr_splitter.errors import PrSplitterError
from pr_splitter.github import create_all_prs
from pr_splitter.models import SplitConfig
from pr_splitter.splitter import execute_split, split


def parse_group_option(values: tuple[str, ...]) -> dict[int, list[str]]:
    result: dict[int, list[str]] = defaultdict(list)
    for value in values:
        if ":" not in value:
            raise click.BadParameter(
                f"Invalid format '{value}'. Expected 'GROUP:VALUE' (e.g., '1:src/**')."
            )
        group_str, pattern = value.split(":", 1)
        try:
            group_num = int(group_str)
        except ValueError:
            raise click.BadParameter(
                f"Invalid group number '{group_str}' in '{value}'. Must be an integer."
            )
        if group_num < 1:
            raise click.BadParameter(
                f"Group number must be >= 1, got {group_num}."
            )
        result[group_num].append(pattern)
    return dict(result)


def parse_title_option(values: tuple[str, ...]) -> dict[int, str]:
    result: dict[int, str] = {}
    for value in values:
        if ":" not in value:
            raise click.BadParameter(
                f"Invalid format '{value}'. Expected 'GROUP:TITLE' (e.g., '1:Add models')."
            )
        group_str, title = value.split(":", 1)
        try:
            group_num = int(group_str)
        except ValueError:
            raise click.BadParameter(
                f"Invalid group number '{group_str}' in '{value}'. Must be an integer."
            )
        if group_num < 1:
            raise click.BadParameter(
                f"Group number must be >= 1, got {group_num}."
            )
        result[group_num] = title
    return result


@click.group()
def main() -> None:
    """PR Splitter — split large PRs into smaller, file-based PRs."""


@main.command()
@click.option(
    "--files",
    multiple=True,
    default=("**/*",),
    help="File glob patterns to include (can be specified multiple times).",
)
@click.option(
    "--exclude",
    multiple=True,
    default=(),
    help="File glob patterns to exclude (can be specified multiple times).",
)
@click.option(
    "--num-prs",
    required=True,
    type=int,
    help="Number of PRs to split into.",
)
@click.option(
    "--prefix",
    default="",
    help="Branch name prefix.",
)
@click.option(
    "--base-branch",
    default="main",
    help="Base branch to compare against.",
)
@click.option(
    "--source-branch",
    default=None,
    help="Source branch (defaults to current branch).",
)
@click.option(
    "--depends-on",
    default=None,
    help="PR or branch that this split depends on.",
)
@click.option(
    "--draft/--no-draft",
    default=True,
    help="Create PRs as drafts.",
)
@click.option(
    "--push/--no-push",
    default=True,
    help="Push branches and create PRs on GitHub.",
)
@click.option(
    "--dry-run",
    is_flag=True,
    default=False,
    help="Show the split plan without creating branches.",
)
@click.option(
    "-y",
    "--yes",
    is_flag=True,
    default=False,
    help="Skip confirmation prompt and proceed automatically.",
)
@click.option(
    "--assign",
    multiple=True,
    default=(),
    help="Assign files to a group: 'GROUP:PATTERN' (e.g., '1:src/**'). Repeatable.",
)
@click.option(
    "--title",
    multiple=True,
    default=(),
    help="Custom title for a group: 'GROUP:TITLE' (e.g., '1:Add models'). Repeatable.",
)
def split_cmd(
    files: tuple[str, ...],
    exclude: tuple[str, ...],
    num_prs: int,
    prefix: str,
    base_branch: str,
    source_branch: str | None,
    depends_on: str | None,
    draft: bool,
    push: bool,
    dry_run: bool,
    yes: bool,
    assign: tuple[str, ...],
    title: tuple[str, ...],
) -> None:
    """Split the current branch's changes into multiple PRs."""
    try:
        assignments = parse_group_option(assign) if assign else {}
        titles = parse_title_option(title) if title else {}

        config = SplitConfig(
            base_branch=base_branch,
            source_branch=source_branch,
            file_patterns=list(files),
            exclude_patterns=list(exclude),
            num_prs=num_prs,
            prefix=prefix,
            depends_on=depends_on,
            draft=draft,
            push=push,
            repo_path=Path("."),
            assignments=assignments,
            titles=titles,
        )

        result = split(config)

        # Display warnings
        for warning in result.warnings:
            click.secho(f"Warning: {warning}", fg="yellow")

        # Display plan
        click.echo()
        click.secho(
            f"Split plan: {len(result.groups)} PR(s) from '{result.source_branch}'",
            fg="blue",
            bold=True,
        )
        click.echo()

        for group in result.groups:
            click.secho(f"  {group.title}", fg="green", bold=True)
            click.echo(f"    Branch: {group.branch_name}")
            click.echo(f"    Files ({len(group.files)}):")
            for f in group.files:
                status_icon = {
                    "A": "+",
                    "M": "~",
                    "D": "-",
                    "R": "→",
                    "C": "©",
                    "T": "T",
                }.get(f.status, "?")
                click.echo(f"      {status_icon} {f.path}")
            click.echo()

        if dry_run:
            click.secho("Dry run — no branches created.", fg="yellow")
            return

        # Confirm
        if not yes and not click.confirm("Proceed with creating branches?"):
            click.secho("Aborted.", fg="red")
            return

        # Execute
        click.echo("Creating branches...")
        execute_split(config, result)
        click.secho("Branches created successfully.", fg="green")

        if push:
            click.echo("Pushing branches and creating PRs...")
            created = create_all_prs(
                result.groups,
                config.base_branch,
                config.draft,
                str(config.repo_path),
            )
            click.echo()
            click.secho("PRs created:", fg="green", bold=True)
            for pr in created:
                click.echo(f"  {pr.title}: {pr.url}")
        else:
            click.secho(
                "Branches created locally. Use --push to push and create PRs.",
                fg="blue",
            )

    except PrSplitterError as e:
        click.secho(f"Error: {e}", fg="red", err=True)
        raise SystemExit(1)
