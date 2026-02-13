class PrSplitterError(Exception):
    """Base exception for pr-splitter."""


class GitError(PrSplitterError):
    """Error related to git operations."""


class ValidationError(PrSplitterError):
    """Error related to input validation."""


class GitHubError(PrSplitterError):
    """Error related to GitHub operations."""
