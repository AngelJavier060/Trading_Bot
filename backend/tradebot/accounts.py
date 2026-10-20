"""Cuentas MT5 guardadas y cuenta activa.

Permite tener varias cuentas (demo/real, distintos brokers) y elegir con cuál
trabaja el sistema. La cuenta activa se recuerda: tras un reinicio, o si MT5 se
desconecta, el sistema vuelve a ella (no a otra).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Optional

from . import secrets
from .storage import Store

KEY_ACCOUNTS = "mt5_accounts"
KEY_ACTIVE = "mt5_active"


@dataclass
class SavedAccount:
    login: int
    server: str
    label: str = ""
    kind: str = "demo"          # demo | real (lo que eligió el usuario; MT5 confirma el real al conectar)
    path: str = ""              # terminal64.exe a usar ("" = el abierto / autodetectar)
    password_enc: str = ""      # contraseña cifrada con DPAPI ("" = no guardada)
    last_used: str = ""
    name: str = ""              # titular según MT5
    currency: str = ""

    @property
    def key(self) -> str:
        return f"{self.login}@{self.server}"

    def public(self) -> dict:
        d = asdict(self)
        d.pop("password_enc")
        d["has_password"] = bool(self.password_enc)
        d["key"] = self.key
        return d


class AccountBook:
    def __init__(self, store: Store):
        self.store = store

    def _load(self) -> list[SavedAccount]:
        return [SavedAccount(**a) for a in self.store.get(KEY_ACCOUNTS, [])]

    def _save(self, accounts: list[SavedAccount]) -> None:
        self.store.set(KEY_ACCOUNTS, [asdict(a) for a in accounts])

    def list(self) -> list[SavedAccount]:
        return sorted(self._load(), key=lambda a: a.last_used, reverse=True)

    def get(self, login: int, server: str) -> Optional[SavedAccount]:
        return next((a for a in self._load() if a.login == int(login) and a.server == server), None)

    def remember(self, login: int, server: str, *, label: str = "", kind: str = "demo", path: str = "",
                 password: Optional[str] = None, keep_password: bool = False,
                 name: str = "", currency: str = "") -> SavedAccount:
        accounts = self._load()
        acc = next((a for a in accounts if a.login == int(login) and a.server == server), None)
        if acc is None:
            acc = SavedAccount(login=int(login), server=server)
            accounts.append(acc)
        acc.label = label or acc.label
        acc.kind = kind or acc.kind
        acc.path = path
        acc.name = name or acc.name
        acc.currency = currency or acc.currency
        acc.last_used = datetime.now(timezone.utc).isoformat()
        if keep_password and password:
            acc.password_enc = secrets.protect(password) or ""
        elif not keep_password:
            acc.password_enc = ""
        self._save(accounts)
        return acc

    def password(self, acc: SavedAccount) -> Optional[str]:
        return secrets.unprotect(acc.password_enc) if acc.password_enc else None

    def delete(self, login: int, server: str) -> bool:
        accounts = self._load()
        kept = [a for a in accounts if not (a.login == int(login) and a.server == server)]
        self._save(kept)
        active = self.active()
        if active and active.login == int(login) and active.server == server:
            self.store.set(KEY_ACTIVE, None)
        return len(kept) != len(accounts)

    def set_active(self, login: int, server: str) -> None:
        self.store.set(KEY_ACTIVE, {"login": int(login), "server": server})

    def clear_active(self) -> None:
        self.store.set(KEY_ACTIVE, None)

    def active(self) -> Optional[SavedAccount]:
        ref = self.store.get(KEY_ACTIVE)
        return self.get(ref["login"], ref["server"]) if ref else None
