// Runs node's test runner over every *.test.js file under a directory,
// found via a plain recursive fs walk instead of a shell/Node-version
// dependent glob pattern (node --test's own glob support differs between
// Node versions, which is what broke this on CI's older Node while working
// locally - see the "fix CI test glob" commit).
import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node test/run.js <directory>');
  process.exit(1);
}

function collect(current) {
  let files = [];
  for (const entry of readdirSync(current)) {
    const full = path.join(current, entry);
    if (statSync(full).isDirectory()) {
      files = files.concat(collect(full));
    } else if (entry.endsWith('.test.js')) {
      files.push(full);
    }
  }
  return files;
}

const files = collect(dir);
if (files.length === 0) {
  console.error(`No test files found under ${dir}`);
  process.exit(1);
}

const child = spawn(
  process.execPath,
  ['--import', './test/setupEnv.js', '--test', '--test-concurrency=1', ...files],
  { stdio: 'inherit' },
);
child.on('exit', (code) => process.exit(code ?? 1));
