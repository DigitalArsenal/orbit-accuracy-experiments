// bar.mjs with --by-day: the bar's table with, beside each row's and each group's day-5 medians (truthDay5), the medians for each lead day 1 to 5
// (truthByDay), cut from rows that record AP's error against the reference orbit in each lead day (daysM). Takes bar.mjs's arguments; a stored
// row without daysM is flown again, so a store of a plain run is read as it stands and completed.
//
//   node experiments/headline-loop/bar-byday.mjs --modules-commit <sha> --modules-root <modules checkout> --out <file> [bar.mjs's other arguments]
process.argv.push('--by-day');
await import('./bar.mjs');
