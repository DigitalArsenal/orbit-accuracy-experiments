import { run } from './lib/confirm-runner.mjs';

await run(new URL('./config.json', import.meta.url));
