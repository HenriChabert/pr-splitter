import subprocess

from git import Repo
from git.exc import GitCommandError, InvalidGitRepositoryError

from pr_splitter.errors import GitError
from pr_splitter.models import FileDiff


def open_repo(path: str) -> Repo:
    try:
        repo = Repo(path, search_parent_directories=True)
    except InvalidGitRepositoryError:
        raise GitError(f"Not a git repository: {path}")
    return repo


def validate_repo_state(repo: Repo, base_branch: str) -> None:
    if repo.is_dirty(untracked_files=True):
        raise GitError("Working tree is not clean. Commit or stash your changes first.")

    try:
        repo.commit(base_branch)
    except Exception:
        raise GitError(f"Base branch '{base_branch}' does not exist.")

    current = get_current_branch(repo)
    if current == base_branch:
        raise GitError(
            f"Currently on base branch '{base_branch}'. "
            "Switch to a feature branch first."
        )


def get_current_branch(repo: Repo) -> str:
    if repo.head.is_detached:
        raise GitError("HEAD is detached. Switch to a branch first.")
    return repo.active_branch.name


def get_changed_files(repo: Repo, base_branch: str) -> list[FileDiff]:
    merge_base = repo.merge_base(base_branch, "HEAD")
    if not merge_base:
        raise GitError(f"No common ancestor between '{base_branch}' and HEAD.")

    result = repo.git.diff("--name-status", "--no-renames", merge_base[0].hexsha, "HEAD")
    if not result:
        return []

    files: list[FileDiff] = []
    for line in result.strip().split("\n"):
        parts = line.split("\t")
        status = parts[0][0]  # Take first char (e.g., R100 -> R)
        path = parts[-1]
        old_path = parts[1] if len(parts) == 3 else None
        files.append(FileDiff(status=status, path=path, old_path=old_path))

    return files


def create_branch_with_files(
    repo: Repo,
    branch_name: str,
    base_branch: str,
    source_branch: str,
    files: list[FileDiff],
) -> None:
    original_branch = get_current_branch(repo)
    try:
        # Create new branch from base
        merge_base = repo.merge_base(base_branch, source_branch)
        if not merge_base:
            raise GitError(
                f"No common ancestor between '{base_branch}' and '{source_branch}'."
            )

        repo.git.checkout(base_branch)
        repo.git.checkout("-b", branch_name)

        # Checkout each file from source branch
        deleted_files: list[str] = []
        checkout_files: list[str] = []
        for f in files:
            if f.status == "D":
                deleted_files.append(f.path)
            else:
                checkout_files.append(f.path)

        if checkout_files:
            repo.git.checkout(source_branch, "--", *checkout_files)

        if deleted_files:
            repo.git.rm(*deleted_files)

        # Commit
        repo.git.add("-A")

        file_count = len(files)
        repo.git.commit(
            "-m",
            f"Part of split from {source_branch} ({file_count} file{'s' if file_count != 1 else ''})",
        )

    except GitCommandError as e:
        raise GitError(f"Failed to create branch '{branch_name}': {e}")
    finally:
        # Always return to original branch
        try:
            repo.git.checkout(original_branch)
        except GitCommandError:
            pass


def branch_exists(repo: Repo, name: str) -> bool:
    # Check local branches
    for ref in repo.branches:
        if ref.name == name:
            return True
    # Check remote branches
    for remote in repo.remotes:
        for ref in remote.refs:
            if ref.remote_head == name:
                return True
    return False


def delete_branch(repo: Repo, name: str) -> None:
    try:
        repo.git.branch("-D", name)
    except GitCommandError:
        pass


def push_branch(branch_name: str, repo_path: str) -> None:
    try:
        subprocess.run(
            ["git", "push", "-u", "origin", branch_name],
            cwd=repo_path,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        raise GitError(f"Failed to push branch '{branch_name}': {e.stderr}")
