// The cells, node ladder and blocks of M28 (amendment A10): constants only, so that the tables can read them without loading the modules.
export const STEP_S = 300, CAP_DAYS = 1200;
export const LADDER = [250, 230, 210, 200, 190, 180, 170, 160, 150, 140, 130, 120];
export const BLOCKS = [[1, 36], [37, 72], [73, 108], [109, 144]]; // 300 s steps after the node: (0, 3 h], (3, 6], (6, 9], (9, 12]
export const CELLS = [
  ...[0.005, 0.02, 0.05].flatMap((B) => ['low', 'moderate', 'high'].map((level) => ({ id: `c-B${B}-${level}`, h0: 300, e0: 0, B, level }))),
  { id: 'e0.05-B0.02-moderate', h0: 250, e0: 0.05, B: 0.02, level: 'moderate' },
  { id: 'e0.05-B0.05-moderate', h0: 250, e0: 0.05, B: 0.05, level: 'moderate' },
  { id: 'e0.15-B0.05-moderate', h0: 250, e0: 0.15, B: 0.05, level: 'moderate' },
];
