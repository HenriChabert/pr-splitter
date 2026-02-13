import pathspec

from pr_splitter.errors import ValidationError
from pr_splitter.git_ops import (
    create_branch_with_files,
    get_changed_files,
    get_current_branch,
    open_repo,
    validate_repo_state,
)
from pr_splitter.models import FileDiff, PrGroup, SplitConfig, SplitResult


def filter_files(
    files: list[FileDiff],
    include_patterns: list[str],
    exclude_patterns: list[str],
) -> list[FileDiff]:
    if include_patterns:
        include_spec = pathspec.PathSpec.from_lines("gitignore", include_patterns)
    else:
        include_spec = None

    if exclude_patterns:
        exclude_spec = pathspec.PathSpec.from_lines("gitignore", exclude_patterns)
    else:
        exclude_spec = None

    result: list[FileDiff] = []
    for f in files:
        if include_spec and not include_spec.match_file(f.path):
            continue
        if exclude_spec and exclude_spec.match_file(f.path):
            continue
        result.append(f)

    return result


def distribute_files(files: list[FileDiff], num_prs: int) -> list[list[FileDiff]]:
    sorted_files = sorted(files, key=lambda f: f.path)
    groups: list[list[FileDiff]] = [[] for _ in range(num_prs)]

    for i, f in enumerate(sorted_files):
        groups[i % num_prs].append(f)

    # Remove empty groups
    return [g for g in groups if g]


def generate_branch_name(source_branch: str, prefix: str, index: int, total: int) -> str:
    # Strip any existing prefix-like patterns from the source branch
    base = source_branch
    if prefix and not base.startswith(prefix):
        base = f"{prefix}{base}"
    return f"{base}-part-{index + 1}-of-{total}"


def build_pr_body(
    group: PrGroup,
    total: int,
    source_branch: str,
    depends_on: str | None = None,
) -> str:
    lines: list[str] = []
    lines.append(f"Part {group.index + 1} of {total} from `{source_branch}`.")
    lines.append("")
    lines.append("## Files")
    lines.append("")
    for f in group.files:
        status_label = {
            "A": "added",
            "M": "modified",
            "D": "deleted",
            "R": "renamed",
            "C": "copied",
            "T": "type changed",
        }.get(f.status, f.status)
        lines.append(f"- `{f.path}` ({status_label})")
    lines.append("")

    if depends_on:
        lines.append(f"Depends on: {depends_on}")
        lines.append("")

    return "\n".join(lines)


def split(config: SplitConfig) -> SplitResult:
    repo = open_repo(str(config.repo_path))
    validate_repo_state(repo, config.base_branch)

    source_branch = config.source_branch or get_current_branch(repo)
    all_files = get_changed_files(repo, config.base_branch)

    if not all_files:
        raise ValidationError("No changed files found between branches.")

    filtered = filter_files(all_files, config.file_patterns, config.exclude_patterns)

    if not filtered:
        raise ValidationError(
            "No files match the given patterns. "
            f"Total changed files: {len(all_files)}."
        )

    warnings: list[str] = []
    actual_num_prs = min(config.num_prs, len(filtered))
    if actual_num_prs < config.num_prs:
        warnings.append(
            f"Requested {config.num_prs} PRs but only {len(filtered)} files "
            f"match. Using {actual_num_prs} PRs instead."
        )

    distributed = distribute_files(filtered, actual_num_prs)

    groups: list[PrGroup] = []
    total = len(distributed)
    for i, file_group in enumerate(distributed):
        branch_name = generate_branch_name(source_branch, config.prefix, i, total)
        title = f"[{i + 1}/{total}] {source_branch}"
        body = build_pr_body(
            PrGroup(
                index=i,
                branch_name=branch_name,
                files=file_group,
                title=title,
                body="",
                depends_on=config.depends_on,
            ),
            total,
            source_branch,
            config.depends_on,
        )
        groups.append(
            PrGroup(
                index=i,
                branch_name=branch_name,
                files=file_group,
                title=title,
                body=body,
                depends_on=config.depends_on,
            )
        )

    return SplitResult(
        groups=groups,
        warnings=warnings,
        source_branch=source_branch,
        base_branch=config.base_branch,
    )


def execute_split(config: SplitConfig, result: SplitResult) -> None:
    repo = open_repo(str(config.repo_path))

    for group in result.groups:
        create_branch_with_files(
            repo=repo,
            branch_name=group.branch_name,
            base_branch=result.base_branch,
            source_branch=result.source_branch,
            files=group.files,
        )
