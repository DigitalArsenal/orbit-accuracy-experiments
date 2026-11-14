"""The power figures of PLAN.md for H1 alone.

  python3 power.py

Method: one chosen row per event, each an independent trial that is "smaller" with probability p (the true share); H1 holds when the lower end of the normal
(Wald) 95 % interval of the observed share, p_hat - 1.96 sqrt(p_hat (1 - p_hat) / n), is above 0.5. The chance is the exact binomial sum over the outcomes
that satisfy this. Rows of one event are not independent in the registered test and the registered interval is an event bootstrap, so the figures are
approximate. Primary events expected: development rate (236 primary events in about 34 days of messages, 6.9 a day) times the window length in days.
"""
from math import comb, sqrt

RATE = 236 / 34.0
DAYS = 28
N0 = RATE * DAYS


def power(n, p, z=1.96, refuted=False):
    tot = 0.0
    for k in range(n + 1):
        ph = k / n
        half_width = z * sqrt(ph * (1 - ph) / n)
        holds = ph + half_width <= 0.5 if refuted else ph - half_width > 0.5
        if holds:
            tot += comb(n, k) * p ** k * (1 - p) ** (n - k)
    return tot


print('primary events expected in %d days at %.1f a day: about %d' % (DAYS, RATE, round(N0)))
print('chance that H1 holds (lower end of the interval above 50 %), by primary events and true share:')
shares = (0.55, 0.60, 0.62, 0.64)
print('%12s %s' % ('events', ' '.join('%6.0f%%' % (100 * p) for p in shares)))
for n in (100, 150, round(N0), 250):
    print('%12d %s' % (n, ' '.join('%7.2f' % power(n, p) for p in shares)))


# Independent increments produce nested event samples; each cell has its own fixed stream.
import json
from pathlib import Path
from statistics import NormalDist
import numpy as np

CONFIG = json.loads(Path(__file__).with_name('config.json').read_text())
TRIALS = 200000
SIMULATION_SEED = 20261114
SHARES = (0.50, 0.55, 0.60, 0.62, 0.64, 0.65)
print('Nested looks: normal-interval approximation to H1 only, not joint H1/H2/H3 power.')
print('200000 simulated tests per cell; default_rng seed 20261114 + 100 * size index + share index.')
print('One row per event, independent Bernoulli trials; floors 40, 40, 100; scaled counts rounded to nearest integer.')
print('Each look uses the two-sided level 1 - 0.05/3. Cumulative means confirmation at any look through that look.')
print('| events at looks 1/2/3 | true share | look 1 | look 2 | look 3 | through 1 | through 2 | through 3 |')
print('| --- | --- | --- | --- | --- | --- | --- | --- |')
for size_index, final_n in enumerate((194, 150, 100)):
    ns = [round(45 * final_n / 194), round(95 * final_n / 194), final_n]
    for share_index, p in enumerate(SHARES):
        rng = np.random.default_rng(SIMULATION_SEED + 100 * size_index + share_index)
        wins = np.zeros(TRIALS, dtype=np.int64)
        cumulative = np.zeros(TRIALS, dtype=bool)
        chances, through = [], []
        previous_n = 0
        for n, look in zip(ns, CONFIG['looks']):
            wins += rng.binomial(n - previous_n, p, size=TRIALS)
            previous_n = n
            ph = wins / n
            z = NormalDist().inv_cdf((1 + look['interval']) / 2)
            confirmed = (ph - z * np.sqrt(ph * (1 - ph) / n) > 0.5) & (n >= look['minimumPrimaryEvents'])
            cumulative |= confirmed
            chances.append(float(confirmed.mean()))
            through.append(float(cumulative.mean()))
        print('| %s | %.0f%% | %s |' % ('/'.join(map(str, ns)), p * 100, ' | '.join('%.3f%%' % (100 * x) for x in chances + through)))
        if p == 0.5:
            mc_se = sqrt(through[-1] * (1 - through[-1]) / TRIALS)
            print('Overall false-confirmation chance at p=50%% (%s): %.3f%%; Monte Carlo SE %.3f percentage points (approximate 95%% margin +/- %.3f points).' %
                  ('/'.join(map(str, ns)), 100 * through[-1], 100 * mc_se, 196 * mc_se))
            print('Original single-run normal approximation at n=%d: %.3f%% (exact binomial sum).' % (final_n, 100 * power(final_n, .5)))
            if through[-1] > .035:
                raise SystemExit('programming-error sanity bound exceeded: simulated H1 false confirmation above 3.5%; this bound is not a design error-control guarantee')
print('The 3.5% bound is a programming-error sanity check, not a pass/fail claim about statistical error control.')
print('Monte Carlo SE of each table entry is sqrt(q * (1-q) / 200000), at most 0.112 percentage points; the normal approximation adds unquantified error.')
print('Final look at n=194, true share 60%%: old 95%% %.6f; amended %.6f (exact binomial sums under the normal-interval approximation).' %
      (power(194, .60), power(194, .60, NormalDist().inv_cdf((1 + CONFIG['looks'][2]['interval']) / 2))))
print('Final look at n=194, true share 40%%: H1 refutation old 95%% %.6f; amended %.6f (exact binomial sums under the normal-interval approximation).' %
      (power(194, .40, refuted=True), power(194, .40, NormalDist().inv_cdf((1 + CONFIG['looks'][2]['interval']) / 2), refuted=True)))
