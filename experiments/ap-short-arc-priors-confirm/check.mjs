// The record's E2E: the registration precedes every row, the pins and holds held, the stored table regenerates, one window per group replays exactly through the modules,
// and every statement is printed with its interval.
import { check } from '../ap-heo-frame-confirm/lib/check-lib.mjs';

await check({
  dir: 'experiments/ap-short-arc-priors-confirm', results: 'results/ap-short-arc-priors-confirm', registration: 'fd8516eeba502829168f13e9e3f454b4a0639e0b',
  replay: ['NG', 'S1', 'LS', 'HC'],
});
