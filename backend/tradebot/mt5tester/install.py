"""Instala y compila los programas MQL5 del TradeBot en un terminal MT5.

Copia mql5/ a <carpeta de datos del terminal>/MQL5/ y compila con MetaEditor.
"""

from __future__ import annotations

import logging
import re
import subprocess
from pathlib import Path

from ..config import PROJECT_ROOT

logger = logging.getLogger(__name__)

MQL5_SOURCE = PROJECT_ROOT / "mql5"


def install_mql5(data_path: Path, terminal_dir: Path, compile_sources: bool = True) -> dict:
    """data_path: carpeta de datos del terminal (terminal_info().data_path).
    terminal_dir: carpeta de instalación (donde está MetaEditor64.exe)."""
    target_root = data_path / "MQL5"
    if not target_root.exists():
        raise FileNotFoundError(f"No existe {target_root}: ¿es la carpeta de datos de un terminal MT5?")

    copied = []
    for src in MQL5_SOURCE.rglob("*"):
        if src.is_dir() or src.suffix not in (".mq5", ".mqh"):
            continue
        dst = target_root / src.relative_to(MQL5_SOURCE)
        dst.parent.mkdir(parents=True, exist_ok=True)
        # MetaEditor interpreta bien los acentos si el archivo es UTF-8 con BOM
        dst.write_bytes(b"\xef\xbb\xbf" + src.read_text(encoding="utf-8").encode("utf-8"))
        copied.append(str(dst.relative_to(target_root)))

    results = {}
    if compile_sources:
        editor = terminal_dir / "MetaEditor64.exe"
        if not editor.exists():
            raise FileNotFoundError(f"No se encontró {editor}")
        for rel in copied:
            if not rel.endswith(".mq5"):
                continue
            results[rel] = compile_mq5(editor, target_root / rel, target_root)
    return {"copied": copied, "compiled": results}


def compile_mq5(editor: Path, source: Path, mql5_root: Path) -> dict:
    log_file = source.with_suffix(".log")
    subprocess.run([str(editor), f"/compile:{source}", f"/log:{log_file}", f"/inc:{mql5_root}"],
                   capture_output=True, timeout=180)
    text = _read_log(log_file)
    m = re.search(r"(\d+)\s+errors?,\s*(\d+)\s+warnings?", text)
    errors = int(m.group(1)) if m else -1
    warnings = int(m.group(2)) if m else -1
    ok = errors == 0 and source.with_suffix(".ex5").exists()
    issues = [ln.strip() for ln in text.splitlines() if " error " in ln.lower() or ": error" in ln.lower()]
    return {"ok": ok, "errors": errors, "warnings": warnings, "issues": issues[:20]}


def _read_log(path: Path) -> str:
    if not path.exists():
        return ""
    raw = path.read_bytes()
    for enc in ("utf-16", "utf-8-sig", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1")
