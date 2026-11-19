"""Unit tests do score de fluxo (routers.interior._airflow_score)."""
from routers.interior import EXCESS_WEIGHT, POS_RATIO, _airflow_score, _useful_intake


def test_intake_up_to_ratio_counts_in_full():
    assert _useful_intake(180, 75) == 180          # Lancool 216: 2,4:1
    assert _useful_intake(POS_RATIO * 86, 86) == POS_RATIO * 86


def test_excess_over_ratio_is_discounted():
    cap = POS_RATIO * 86
    assert _useful_intake(368, 86) == cap + EXCESS_WEIGHT * (368 - cap)


def test_no_exhaust_keeps_intake_but_score_capped_at_40():
    assert _useful_intake(200, 0) == 200
    assert _airflow_score(400, 0, 300, 0, 0) == 40


def test_score_is_monotonic_in_intake():
    a = _airflow_score(250, 86, 630, 1.0, 0)
    b = _airflow_score(368, 86, 630, 1.0, 0)
    assert b >= a  # mais entrada nunca piora — só rende menos


def test_flux_pro_4090_reference():
    # 7800X3D/9800X3D (120 W) + 4090 (450 W) + 60 W; 3,5-slot, folga lateral 119 mm
    assert _airflow_score(367.88, 85.96, 630, 1.0, 0.0) == 71
