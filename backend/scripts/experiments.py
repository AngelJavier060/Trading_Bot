"""Consultar y gestionar experimentos.

    .venv\\Scripts\\python scripts\\experiments.py list
    .venv\\Scripts\\python scripts\\experiments.py show 3
    .venv\\Scripts\\python scripts\\experiments.py compare 5 3      (¿5 es mejor que 3?)
    .venv\\Scripts\\python scripts\\experiments.py promote 5        (marcar como versión activa)
"""

from __future__ import annotations

import argparse
import json
import sys

from _common import utf8_console

from tradebot.config import Settings
from tradebot.research.experiments import compare_experiments
from tradebot.storage import Store


def main() -> int:
    utf8_console()
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    ls = sub.add_parser("list")
    ls.add_argument("--limit", type=int, default=30)
    ls.add_argument("--kind")
    sub.add_parser("show").add_argument("id", type=int)
    cmp_ = sub.add_parser("compare")
    cmp_.add_argument("a", type=int)
    cmp_.add_argument("b", type=int)
    for name in ("promote", "reject"):
        sub.add_parser(name).add_argument("id", type=int)
    args = p.parse_args()

    settings = Settings.from_env()
    store = Store(settings.database_url or settings.db_path)
    if args.cmd == "list":
        for e in store.experiments(limit=args.limit, kind=args.kind):
            m = e["metrics"].get("candidate", e["metrics"])
            pf = m.get("profit_factor", "-")
            n = m.get("total_trades", m.get("samples", "-"))
            print(f"#{e['id']:<4} {e['created'][:16]} {e['status']:9} {e['kind']:20} PF {pf!s:6} n {n!s:5} {e['name']}")
    elif args.cmd == "show":
        print(json.dumps(store.experiment(args.id), indent=2, ensure_ascii=False))
    elif args.cmd == "compare":
        r = compare_experiments(store, args.a, args.b)
        print(f"¿#{args.a} mejora a #{args.b}? {'SÍ' if r['verdict']['passed'] else 'NO'}"
              + ("" if r["same_period"] else "  (ojo: periodos distintos)"))
        for c in r["verdict"]["checks"]:
            print(f"  {'✔' if c['passed'] else '✘'} {c['check']}: {c['detail']}")
    else:
        store.set_experiment_status(args.id, "promoted" if args.cmd == "promote" else "rejected")
        print(f"Experimento #{args.id}: {args.cmd}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
