// A blocked or incomplete archive experiment must never produce a passing receipt.
import fs from 'node:fs';
const result = JSON.parse(fs.readFileSync(new URL('../../results/ap-gap/status.json', import.meta.url)));
console.log(JSON.stringify(result, null, 2));
console.error('FAIL: hold-out isolation violated during selection; forward repeatability and methods 1–5 acceptance are incomplete.');
process.exitCode = 1;
