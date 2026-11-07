"""Write FastAPI's OpenAPI document to a file (used by `make gen-client`; no server needed)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from app.main import app


def main() -> int:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "openapi.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(app.openapi(), indent=1, sort_keys=False) + "\n")
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
