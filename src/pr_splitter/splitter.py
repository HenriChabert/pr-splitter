import pathspec

from pr_splitter.errors import ValidationError
from pr_splitter.git_ops import (
    create_branch_with_files,
    get_changed_files,
    get_current_branch,
    open_repo,
    validate_repo_state,
)
from pr_splitter.github import get_current_pr_info
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


def assign_files(
    files: list[FileDiff],
    assignments: dict[int, list[str]],
    num_prs: int,
) -> list[list[FileDiff]]:
    groups: list[list[FileDiff]] = [[] for _ in range(num_prs)]
    leftover: list[FileDiff] = []

    # Build pathspecs for each group
    group_specs: dict[int, pathspec.PathSpec] = {}
    for group_num, patterns in assignments.items():
        group_specs[group_num] = pathspec.PathSpec.from_lines("gitignore", patterns)

    sorted_files = sorted(files, key=lambda f: f.path)
    for f in sorted_files:
        assigned = False
        # Check groups in order (1, 2, 3, ...)
        for group_num in sorted(group_specs.keys()):
            if group_specs[group_num].match_file(f.path):
                groups[group_num - 1].append(f)  # 1-indexed to 0-indexed
                assigned = True
                break
        if not assigned:
            leftover.append(f)

    result = [g for g in groups if g]
    if leftover:
        result.append(leftover)

    return result


def generate_branch_name(
    source_branch: str, prefix: str, index: int, total: int, is_leftover: bool = False
) -> str:
    base = source_branch
    if prefix and not base.startswith(prefix):
        base = f"{prefix}{base}"
    if is_leftover:
        return f"{base}-part-leftover-of-{total}"
    return f"{base}-part-{index + 1}-of-{total}"


def build_pr_body(
    group: PrGroup,
    total: int,
    source_branch: str,
    depends_on: str | None = None,
    source_body: str | None = None,
) -> str:
    lines: list[str] = []

    if source_body:
        lines.append(source_body)
        lines.append("")
        lines.append("---")
        lines.append("")

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

    # Try to fetch source PR info for titles and body
    pr_info = get_current_pr_info(str(config.repo_path))
    source_pr_title = pr_info.get("title", "")
    source_body = pr_info.get("body", "") or None
    base_title = source_pr_title or source_branch

    warnings: list[str] = []

    if config.assignments:
        distributed = assign_files(filtered, config.assignments, config.num_prs)
        has_leftover = len(distributed) > config.num_prs
        if has_leftover:
            leftover_count = len(distributed[-1])
            warnings.append(
                f"{leftover_count} file(s) were not matched by any --assign "
                "pattern and will be in a separate group."
            )
    else:
        actual_num_prs = min(config.num_prs, len(filtered))
        if actual_num_prs < config.num_prs:
            warnings.append(
                f"Requested {config.num_prs} PRs but only {len(filtered)} files "
                f"match. Using {actual_num_prs} PRs instead."
            )
        distributed = distribute_files(filtered, actual_num_prs)
        has_leftover = False

    groups: list[PrGroup] = []
    total = len(distributed)
    for i, file_group in enumerate(distributed):
        is_leftover = has_leftover and i == len(distributed) - 1
        branch_name = generate_branch_name(
            source_branch, config.prefix, i, total, is_leftover=is_leftover
        )

        # Use custom title if provided (1-indexed), else default
        custom_title = config.titles.get(i + 1)
        if is_leftover:
            title = f"[leftover/{total}] {base_title}"
        elif custom_title:
            title = f"[{i + 1}/{total}] {custom_title}"
        else:
            title = f"[{i + 1}/{total}] {base_title}"

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
            source_body,
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
