import json
import subprocess

from pr_splitter.errors import GitHubError
from pr_splitter.git_ops import push_branch
from pr_splitter.models import CreatedPr, PrGroup


def check_gh_available() -> None:
    try:
        subprocess.run(
            ["gh", "auth", "status"],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        raise GitHubError(
            "GitHub CLI (gh) is not installed. "
            "Install it from https://cli.github.com/"
        )
    except subprocess.CalledProcessError:
        raise GitHubError(
            "Not authenticated with GitHub CLI. Run 'gh auth login' first."
        )


def create_pr(
    group: PrGroup,
    base_branch: str,
    draft: bool,
    repo_path: str,
) -> CreatedPr:
    cmd = [
        "gh",
        "pr",
        "create",
        "--base",
        base_branch,
        "--head",
        group.branch_name,
        "--title",
        group.title,
        "--body",
        group.body,
    ]
    if draft:
        cmd.append("--draft")

    try:
        result = subprocess.run(
            cmd,
            cwd=repo_path,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        raise GitHubError(f"Failed to create PR for '{group.branch_name}': {e.stderr}")

    url = result.stdout.strip()

    # Get PR number from URL (last segment)
    pr_number = int(url.rstrip("/").split("/")[-1])

    return CreatedPr(
        number=pr_number,
        url=url,
        branch_name=group.branch_name,
        title=group.title,
    )


def create_all_prs(
    groups: list[PrGroup],
    base_branch: str,
    draft: bool,
    repo_path: str,
) -> list[CreatedPr]:
    check_gh_available()

    created: list[CreatedPr] = []
    for group in groups:
        push_branch(group.branch_name, repo_path)
        pr = create_pr(group, base_branch, draft, repo_path)
        created.append(pr)

    return created
