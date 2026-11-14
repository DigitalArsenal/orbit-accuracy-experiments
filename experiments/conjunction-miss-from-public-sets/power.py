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


def power(n, p, z=1.96):
    tot = 0.0
    for k in range(n + 1):
        ph = k / n
        if ph - z * sqrt(ph * (1 - ph) / n) > 0.5:
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
            print('Overall false-confirmation chance at p=50%% (%s): %.3f%%; required <=2.5%%: %s' %
                  ('/'.join(map(str, ns)), 100 * through[-1], 'PASS' if through[-1] <= .025 else 'FAIL'))
            if through[-1] > .025:
                raise SystemExit('the simulated H1 false-confirmation chance exceeds 2.5%')
print('Final look at n=194, true share 60%%: old 95%% %.6f; amended %.6f (exact binomial sums under the normal-interval approximation).' %
      (power(194, .60), power(194, .60, NormalDist().inv_cdf((1 + CONFIG['looks'][2]['interval']) / 2))))
