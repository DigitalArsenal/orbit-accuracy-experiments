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
