import pytest

from tradebot.broker import MT5Error, SymbolResolver, canonical
from tradebot.broker.symbols import SymbolCandidate, parse_symbol_map, pick_symbol


@pytest.mark.parametrize("raw,expected", [
    ("EURUSD", "EURUSD"),
    ("eur/usd", "EURUSD"),
    (" EURUSD-OTC ", "EURUSD"),
    ("EURUSD-T", "EURUSD-T"),
])
def test_canonical(raw, expected):
    assert canonical(raw) == expected


def C(name, trade_mode=4, visible=False):
    return SymbolCandidate(name=name, trade_mode=trade_mode, visible=visible)


def test_pick_suffix_variants():
    assert pick_symbol("EURUSD", [C("EURUSD-T"), C("EURUSDX-ETF")]) == "EURUSD-T"
    assert pick_symbol("EURUSD", [C("EURUSD.a"), C("EURUSD")]) == "EURUSD"
    assert pick_symbol("EURUSD", [C("EURUSDm")]) == "EURUSDm"


def test_pick_avoids_other_instruments():
    # US500 no debe confundirse con la acción de Plus500
    assert pick_symbol("US500", [C("#PLUS500-T")]) is None


def test_pick_prefers_tradeable_and_visible():
    assert pick_symbol("EURUSD", [C("EURUSD.x", trade_mode=0), C("EURUSD.y")]) == "EURUSD.y"
    assert pick_symbol("EURUSD", [C("EURUSD.b"), C("EURUSD.a", visible=True)]) == "EURUSD.a"


def test_resolver_finds_broker_name(ctx):
    assert ctx.resolver.resolve("EURUSD") == "EURUSD-T"
    assert ctx.resolver.resolve("eur/usd") == "EURUSD-T"


def test_resolver_aliases(ctx):
    assert ctx.resolver.resolve("XAUUSD") == "GOLD-T"


def test_resolver_unknown_symbol(ctx):
    with pytest.raises(MT5Error):
        ctx.resolver.resolve("US500")


def test_resolver_overrides(ctx):
    r = SymbolResolver(ctx.client, parse_symbol_map("EURUSD=GOLD-T"))
    assert r.resolve("EURUSD") == "GOLD-T"


def test_spec(ctx):
    spec = ctx.resolver.spec("EURUSD")
    assert spec.name == "EURUSD-T"
    assert spec.digits == 5 and spec.tick_value == 1.0 and spec.volume_step == 0.01
