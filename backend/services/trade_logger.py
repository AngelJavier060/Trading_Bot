import json
import os
from datetime import datetime


LOG_FILE = os.path.join('data', 'trade_log.jsonl')


def log_trade(
    event_type: str,
    source: str,
    account_type: str | None = None,
    email: str | None = None,
    asset: str | None = None,
    amount: float | None = None,
    direction: str | None = None,
    expiration: int | None = None,
    order_id: int | None = None,
    extra: dict | None = None,
) -> None:
    """Registra un evento de trading en un archivo JSONL para análisis posterior."""
    entry: dict = {
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'event_type': event_type,
        'source': source,
    }

    if account_type is not None:
        entry['account_type'] = account_type
    if email is not None:
        entry['email'] = email
    if asset is not None:
        entry['asset'] = asset
    if amount is not None:
        entry['amount'] = float(amount)
    if direction is not None:
        entry['direction'] = direction
    if expiration is not None:
        entry['expiration'] = int(expiration)
    if order_id is not None:
        entry['order_id'] = int(order_id)
    if extra:
        entry['extra'] = extra

    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + '\n')
