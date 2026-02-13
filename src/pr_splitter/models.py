from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class SplitConfig(BaseModel):
    base_branch: str = "main"
    source_branch: str | None = None  # None means current branch
    file_patterns: list[str] = Field(default_factory=lambda: ["**/*"])
    exclude_patterns: list[str] = Field(default_factory=list)
    num_prs: int = Field(ge=1)
    prefix: str = ""
    depends_on: str | None = None
    draft: bool = True
    push: bool = True
    repo_path: Path = Field(default_factory=lambda: Path("."))
    assignments: dict[int, list[str]] = Field(default_factory=dict)
    titles: dict[int, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_config(self) -> "SplitConfig":
        if self.source_branch and self.source_branch == self.base_branch:
            raise ValueError("source_branch and base_branch must be different")
        for group_num in self.assignments:
            if group_num < 1 or group_num > self.num_prs:
                raise ValueError(
                    f"Assignment group {group_num} is out of range "
                    f"(must be between 1 and {self.num_prs})"
                )
        for group_num in self.titles:
            if group_num < 1 or group_num > self.num_prs:
                raise ValueError(
                    f"Title group {group_num} is out of range "
                    f"(must be between 1 and {self.num_prs})"
                )
        return self


class FileDiff(BaseModel):
    path: str
    status: Literal["A", "M", "D", "R", "C", "T"]
    old_path: str | None = None


class PrGroup(BaseModel):
    index: int
    branch_name: str
    files: list[FileDiff]
    title: str
    body: str
    depends_on: str | None = None


class SplitResult(BaseModel):
    groups: list[PrGroup]
    warnings: list[str] = Field(default_factory=list)
    source_branch: str = ""
    base_branch: str = ""


class CreatedPr(BaseModel):
    number: int
    url: str
    branch_name: str
    title: str
