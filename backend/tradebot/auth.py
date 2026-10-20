"""Usuarios del sistema: contraseñas con hash y tokens de sesión firmados.

- Contraseñas: hash scrypt/pbkdf2 de Werkzeug (nunca se guardan en claro).
- Token: firmado con SECRET_KEY, caduca a las `TOKEN_HOURS` horas y deja de valer
  si el usuario cambia su contraseña.
- Bloqueo: tras 5 intentos fallidos desde la misma IP, 60 s de espera.
"""

from __future__ import annotations

import secrets as pysecrets
import threading
import time
from typing import Optional

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

from .storage import Store

TOKEN_HOURS = 12
MIN_PASSWORD = 8
MAX_FAILS = 5
LOCK_SECONDS = 60


class AuthError(Exception):
    pass


class Auth:
    def __init__(self, store: Store, secret_key: str = ""):
        self.store = store
        if not secret_key:
            # Sin SECRET_KEY en .env se genera una y se guarda: las sesiones sobreviven a reinicios
            secret_key = store.get("secret_key")
            if not secret_key:
                secret_key = pysecrets.token_urlsafe(48)
                store.set("secret_key", secret_key)
        self._serializer = URLSafeTimedSerializer(secret_key, salt="tradebot-auth")
        self._fails: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    # ── usuarios ────────────────────────────────────────────────────────

    def needs_setup(self) -> bool:
        return self.store.count_users() == 0

    def create_user(self, username: str, password: str, role: str = "admin") -> dict:
        username = (username or "").strip().lower()
        if len(username) < 3:
            raise AuthError("El usuario debe tener al menos 3 caracteres")
        if len(password or "") < MIN_PASSWORD:
            raise AuthError(f"La contraseña debe tener al menos {MIN_PASSWORD} caracteres")
        if self.store.get_user(username):
            raise AuthError(f"El usuario {username} ya existe")
        uid = self.store.add_user(username, generate_password_hash(password), role)
        return self.public(self.store.get_user_by_id(uid))

    def change_password(self, user_id: int, current: str, new: str) -> None:
        user = self.store.get_user_by_id(user_id)
        if not user or not check_password_hash(user["password_hash"], current or ""):
            raise AuthError("La contraseña actual no es correcta")
        if len(new or "") < MIN_PASSWORD:
            raise AuthError(f"La contraseña nueva debe tener al menos {MIN_PASSWORD} caracteres")
        self.store.set_password(user_id, generate_password_hash(new))

    @staticmethod
    def public(user: Optional[dict]) -> Optional[dict]:
        if not user:
            return None
        return {k: user[k] for k in ("id", "username", "role", "created", "last_login") if k in user}

    # ── sesión ──────────────────────────────────────────────────────────

    def login(self, username: str, password: str, client_ip: str = "") -> tuple[str, dict]:
        self._check_lock(client_ip)
        user = self.store.get_user(username or "")
        if not user or not check_password_hash(user["password_hash"], password or ""):
            self._register_fail(client_ip)
            raise AuthError("Usuario o contraseña incorrectos")
        with self._lock:
            self._fails.pop(client_ip, None)
        self.store.touch_login(user["id"])
        return self._issue(user), self.public(user)

    def verify(self, token: str) -> Optional[dict]:
        try:
            data = self._serializer.loads(token, max_age=TOKEN_HOURS * 3600)
        except (BadSignature, SignatureExpired):
            return None
        user = self.store.get_user_by_id(int(data.get("uid", 0)))
        if not user or data.get("pw") != user["password_hash"][-12:]:
            return None  # usuario borrado o contraseña cambiada
        return self.public(user)

    def _issue(self, user: dict) -> str:
        return self._serializer.dumps({"uid": user["id"], "pw": user["password_hash"][-12:]})

    def _check_lock(self, ip: str) -> None:
        with self._lock:
            recent = [t for t in self._fails.get(ip, []) if time.time() - t < LOCK_SECONDS]
            self._fails[ip] = recent
            if len(recent) >= MAX_FAILS:
                wait = int(LOCK_SECONDS - (time.time() - recent[0])) + 1
                raise AuthError(f"Demasiados intentos fallidos. Espera {wait} s.")

    def _register_fail(self, ip: str) -> None:
        with self._lock:
            self._fails.setdefault(ip, []).append(time.time())
