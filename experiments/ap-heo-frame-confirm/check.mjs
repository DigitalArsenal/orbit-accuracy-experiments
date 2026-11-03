// The record's E2E: the registration precedes every row, the pins and holds held, the stored table regenerates, one window per group replays exactly through the modules,
// AP6's seven TESS windows agree with the module's own table, and every statement is printed with its interval.
import { check } from './lib/check-lib.mjs';

// The sdn-ap SPEC 16.4 table (modules 47d998ca0): day-3 error in meters of the previous build (0.4.5) and of AP and XP of 0.4.6 and later, per fit end.
const TABLE = [['2026-07-27', 2009.249179, 1280.596477, 1280.868413], ['2026-08-03', 2496.529273, 2684.873011, 2684.869564], ['2026-08-10', 1463.232922, 1214.681850, 1214.683662], ['2026-08-17', 1211.231855, 791.128364, 791.126063], ['2026-08-24', 1850.254952, 1385.636736, 1385.640624], ['2026-08-31', 2017.233821, 1833.692391, 1833.693176], ['2026-09-07', 2157.517187, 1574.829241, 1574.457639]];
await check({
  dir: 'experiments/ap-heo-frame-confirm', results: 'results/ap-heo-frame-confirm', registration: '60810d8072bdc74c0f924f17e19b50e08ea84de8',
  replay: ['HE', 'HX', 'GN', 'LS'],
  references: [{ group: 'HEr', toleranceM: 0.002, rows: TABLE.flatMap(([cutoff, previous, ap, xp]) => [{ cutoff, arm: 'A4572', day: 3, meters: previous }, { cutoff, arm: 'AP72', day: 3, meters: ap }, { cutoff, arm: 'A4672', day: 3, meters: ap }, { cutoff, arm: 'XP72', day: 3, meters: xp }]) }],
});
