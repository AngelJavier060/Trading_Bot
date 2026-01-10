import json
import os
from datetime import date


STATE_FILE = os.path.join('data', 'risk_state.json')


def _load_state() -> dict:
    """Carga el estado de riesgo diario desde disco, reseteando si cambia la fecha."""
    today_str = date.today().isoformat()

    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                state = json.load(f)
        except Exception:
            state = {}
    else:
        state = {}

    if state.get('date') != today_str:
        state = {
            'date': today_str,
            'trades_count': 0,
            'total_amount': 0.0,
        }

    return state


def _save_state(state: dict) -> None:
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def can_place_trade(amount: float, max_trades_per_day: int | None = None, max_daily_amount: float | None = None) -> tuple[bool, str | None]:
    """Verifica si se puede abrir una nueva operación según los límites diarios."""
    state = _load_state()

    if max_trades_per_day is not None and state['trades_count'] >= max_trades_per_day:
        return False, 'Se alcanzó el número máximo de operaciones diarias.'

    if max_daily_amount is not None and state['total_amount'] + float(amount) > max_daily_amount:
        return False, 'Se alcanzó el límite diario de monto arriesgado.'

    return True, None


def register_trade(amount: float) -> None:
    """Registra una operación abierta, actualizando contadores diarios."""
    state = _load_state()
    state['trades_count'] += 1
    state['total_amount'] += float(amount)
    _save_state(state)


def get_risk_state() -> dict:
    state = _load_state()
    return state
