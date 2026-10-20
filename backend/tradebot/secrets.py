"""Cifrado de contraseñas con DPAPI de Windows.

Lo cifrado solo lo puede descifrar el mismo usuario de Windows en la misma
máquina: si alguien copia la base de datos a otro equipo, no obtiene las
contraseñas. Fuera de Windows no se guardan contraseñas.
"""

from __future__ import annotations

import base64
import ctypes
import sys
from ctypes import wintypes
from typing import Optional

AVAILABLE = sys.platform == "win32"


class _Blob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _to_blob(data: bytes) -> _Blob:
    buf = ctypes.create_string_buffer(data, len(data))
    return _Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))


def _from_blob(blob: _Blob) -> bytes:
    data = ctypes.string_at(blob.pbData, blob.cbData)
    ctypes.windll.kernel32.LocalFree(blob.pbData)
    return data


def protect(text: str) -> Optional[str]:
    """Cifra y devuelve base64, o None si no hay DPAPI."""
    if not AVAILABLE or not text:
        return None
    src, out = _to_blob(text.encode("utf-8")), _Blob()
    if not ctypes.windll.crypt32.CryptProtectData(ctypes.byref(src), "TradeBot", None, None, None, 0x01,
                                                   ctypes.byref(out)):
        raise OSError("No se pudo cifrar la contraseña (CryptProtectData)")
    return base64.b64encode(_from_blob(out)).decode("ascii")


def unprotect(token: Optional[str]) -> Optional[str]:
    if not AVAILABLE or not token:
        return None
    src, out = _to_blob(base64.b64decode(token)), _Blob()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(src), None, None, None, None, 0x01,
                                                     ctypes.byref(out)):
        return None  # cifrada por otro usuario/equipo
    return _from_blob(out).decode("utf-8")
