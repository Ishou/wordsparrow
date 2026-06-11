from __future__ import annotations

import re

from parse import REPO_ROOT

README_PATH = REPO_ROOT / "README.md"

MARKER_IDS = ("cluster", "cloud", "flow", "observability", "clue-pipeline")


def _block(marker: str, mermaid: str, caption: str | None) -> str:
    body = f"```mermaid\n{mermaid}\n```"
    if caption:
        body += f'\n<p align="center"><sub>{caption}</sub></p>'
    return (
        f"<!-- INFRA-DIAGRAM:{marker} START -->\n"
        f"{body}\n"
        f"<!-- INFRA-DIAGRAM:{marker} END -->"
    )


def inject(text: str, marker: str, mermaid: str, caption: str | None = None) -> str:
    start = f"<!-- INFRA-DIAGRAM:{marker} START -->"
    end = f"<!-- INFRA-DIAGRAM:{marker} END -->"
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.DOTALL)
    if not pattern.search(text):
        raise ValueError(f"marker pair not found in README: {marker}")
    # lambda replacement avoids backreference interpretation in the mermaid body
    return pattern.sub(lambda _match: _block(marker, mermaid, caption), text)
