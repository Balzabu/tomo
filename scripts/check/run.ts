// Runs the assertion scripts for the pure modules under plain Node (22.6+):
//   npm run check
// These modules use only `import type` from the app, so no bundler or device
// is needed. They are excluded from tsc (tsconfig "exclude") because they
// import node builtins.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const tests = readdirSync(dir).filter((f) => f.endsWith('.test.ts')).sort();
let failed = 0;
for (const f of tests) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(dir, f)], {
    stdio: 'inherit',
  });
  if (r.status !== 0) failed++;
}
if (failed) {
  console.error(`\n${failed} of ${tests.length} check script(s) failed`);
  process.exit(1);
}
console.log(`\nall ${tests.length} check scripts passed`);
