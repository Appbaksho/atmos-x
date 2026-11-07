"""File storage behind a small interface (prompt-v1 §3.1). Local disk now; S3 can come later."""

from __future__ import annotations

import os
from pathlib import Path

from .config import settings


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root

    def _path(self, rel: str) -> Path:
        p = (self.root / rel).resolve()
        if not str(p).startswith(str(self.root.resolve())):
            raise ValueError("path escapes storage root")
        return p

    def save(self, rel: str, data: bytes) -> str:
        p = self._path(rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, p)
        return rel

    def path(self, rel: str) -> Path:
        return self._path(rel)

    def exists(self, rel: str) -> bool:
        return self._path(rel).exists()

    def delete(self, rel: str) -> None:
        p = self._path(rel)
        if p.exists():
            p.unlink()


def storage() -> LocalStorage:
    return LocalStorage(settings.data_path / "uploads")
