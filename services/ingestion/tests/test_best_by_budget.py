"""Unit tests de seed.best_by_budget.pick_all (sem base, sem rede)."""
from seed.best_by_budget import BUDGETS, pick_all


def _pair(fps, total, calls=None):
    def complete():
        if calls is not None:
            calls.append(fps)
        return None if total is None else (total, {"fps": fps})
    return (fps, complete)


def test_budgets_cover_2k_to_20k_in_500_steps():
    assert BUDGETS[0] == 2000 and BUDGETS[-1] == 20000
    assert all(b - a == 500 for a, b in zip(BUDGETS, BUDGETS[1:]))


def test_each_budget_gets_most_fps_that_fits():
    pairs = [_pair(300, 9500), _pair(246, 6510), _pair(141, 4410)]
    got = pick_all(pairs, [4000, 4500, 7000, 10000])
    assert 4000 not in got                       # nada cabe: a página não existe
    assert got[4500][1] == 4410
    assert got[7000][1] == 6510
    assert got[10000][1] == 9500


def test_same_rule_as_the_rei_at_the_tier_cap():
    # o "até R$ 7.000" tem de ser o mesmo par que o "Rei até R$ 7k" escolheria:
    # FPS arredondado empatado (246 ≈ 245,6) → ganha a mais barata
    pairs = [_pair(292.7, 9500), _pair(246, 6510), _pair(245.6, 6100)]
    assert pick_all(pairs, [7000])[7000][1] == 6100


def test_completion_is_not_recomputed_across_budgets_by_the_pair_itself():
    calls = []
    memo = {}

    def memo_pair(fps, total):
        def complete():
            if fps not in memo:
                calls.append(fps)
                memo[fps] = (total, {"fps": fps})
            return memo[fps]
        return (fps, complete)

    pick_all([memo_pair(300, 9500), memo_pair(200, 5000)], [5000, 6000, 10000])
    assert sorted(calls) == [200, 300]           # cada par completado uma vez só
