"""Download the Démonette-2 dump (CC BY-SA 4.0, osf.io/db2w8) into data/external/demonette/ — see ADR-0119 / ADR-0058 for the license posture (redistribute forbidden, gitignored)."""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

DEFAULT_DEST = Path("data/external/demonette")

# name -> (OSF download URL, expected byte size from the osf.io/db2w8 listing)
FILES: dict[str, tuple[str, int]] = {
    "relations.csv": ("https://osf.io/download/8qcsw/", 39093363),
    "families.csv": ("https://osf.io/download/r8k5z/", 4909670),
    "lexemes.csv": ("https://osf.io/download/u4q7n/", 91502542),
}


def fetch_one(name: str, url: str, expected_size: int, dest: Path) -> bool:
    target = dest / name
    if target.exists() and target.stat().st_size == expected_size:
        print(f"skip {name} (present, {expected_size} bytes)")
        return False
    tmp = target.with_suffix(target.suffix + ".part")
    print(f"downloading {name} from {url}")
    urllib.request.urlretrieve(url, tmp)
    size = tmp.stat().st_size
    if size != expected_size:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"{name}: got {size} bytes, expected {expected_size}")
    tmp.rename(target)
    print(f"wrote {name} ({size} bytes)")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST)
    parser.add_argument(
        "--only",
        choices=sorted(FILES),
        action="append",
        help="fetch only the named file(s); default fetches all three",
    )
    args = parser.parse_args()

    args.dest.mkdir(parents=True, exist_ok=True)
    wanted = args.only or list(FILES)
    for name in wanted:
        url, size = FILES[name]
        try:
            fetch_one(name, url, size, args.dest)
        except Exception as exc:  # noqa: BLE001
            print(f"error fetching {name}: {exc}", file=sys.stderr)
            raise


if __name__ == "__main__":
    main()
