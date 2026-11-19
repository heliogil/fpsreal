"""Unit tests da escolha do Rei por faixa (seed.crown_reis.pick_rei)."""
from seed.crown_reis import notify_telegram, pick_rei, telegram_message
from tiers import TIER_BY_KEY, TIERS


def _pair(fps, total, calls=None):
    def complete():
        if calls is not None:
            calls.append(fps)
        return None if total is None else (total, {"fps": fps})
    return (fps, complete)


def test_most_fps_under_cap_wins():
    t = TIER_BY_KEY["r5k"]  # até 7000
    best = pick_rei([_pair(300, 9000), _pair(246, 6510), _pair(164, 6980)], t)
    assert best[0] == 246 and best[1] == 6510


def test_same_fps_prefers_cheaper():
    t = TIER_BY_KEY["r8k"]
    best = pick_rei([_pair(292.7, 9500), _pair(292.6, 8060), _pair(200, 5000)], t)
    assert best[1] == 8060


def test_no_valid_completion_is_skipped():
    t = TIER_BY_KEY["r3k"]
    best = pick_rei([_pair(200, None), _pair(141, 4410)], t)
    assert best[1] == 4410


def test_top_tier_must_spend_above_floor():
    t = TIER_BY_KEY["r12k_plus"]  # > 11000, sem teto
    assert pick_rei([_pair(292.7, 9500)], t) is None
    best = pick_rei([_pair(400, 14000), _pair(292.7, 9500)], t)
    assert best[1] == 14000


def test_nothing_fits_returns_none():
    assert pick_rei([_pair(100, 5000)], TIER_BY_KEY["r3k"]) is None


def test_stops_asking_once_lower_fps_cannot_win():
    calls = []
    pick_rei([_pair(300, 6000, calls), _pair(250, 5000, calls), _pair(100, 3000, calls)], TIER_BY_KEY["r5k"])
    assert calls == [300]  # o par vencedor resolveu; os de menos FPS nem foram completados


def test_tier_caps_are_increasing():
    caps = [t.cap_brl for t in TIERS if t.cap_brl]
    assert caps == sorted(caps)
    assert TIERS[-1].floor_brl == TIERS[-2].cap_brl


def test_telegram_message_has_build_link_and_numbers():
    m = telegram_message("R$ 11k+", "Ryzen 7 9800X3D", "GeForce RTX 4090", 21853.0, 419.0, "rei-r12k")
    assert "Novo Rei R$ 11k+" in m
    assert "Ryzen 7 9800X3D + GeForce RTX 4090" in m
    assert "R$ 21.853" in m and "419 FPS" in m and "R$ 52,16/FPS" in m
    assert "https://reidofps.com.br/build/rei-r12k?utm_source=telegram&utm_medium=rei-mudou" in m


def test_notify_without_env_does_nothing(monkeypatch):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)

    def boom(*a, **k):
        raise AssertionError("não devia chamar a rede")
    monkeypatch.setattr("urllib.request.urlopen", boom)
    notify_telegram(["oi"])  # sem token/canal: nem tenta


def test_notify_failure_never_raises_nor_leaks_token(monkeypatch, capsys):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:SEGREDO")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "@canal")

    def fail(*a, **k):
        raise OSError("rede fora")
    monkeypatch.setattr("urllib.request.urlopen", fail)
    notify_telegram(["oi"])
    out = capsys.readouterr().out
    assert "SEGREDO" not in out and "api.telegram.org" not in out
    assert "0/1" in out


# --- falha da API de fluxo de ar ≠ fluxo baixo -------------------------------
def test_air_retries_then_succeeds(monkeypatch):
    import seed.crown_reis as C
    answers = iter([None, None, 77.0])
    monkeypatch.setattr(C, "_airflow", lambda parts: next(answers))
    assert C._air({}, sleep=lambda s: None) == 77.0


def test_air_raises_when_api_stays_down(monkeypatch):
    import pytest
    import seed.crown_reis as C
    monkeypatch.setattr(C, "_airflow", lambda parts: None)
    with pytest.raises(C.AirflowUnavailable):
        C._air({}, sleep=lambda s: None)
