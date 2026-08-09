#!/usr/bin/env node
// Local CLI — the same gate you get in CI, runnable before you push.
//
//   npx boy-scout                 # diff against the default base ref
//   npx boy-scout origin/develop  # diff against an explicit base ref
//   npx boy-scout --config path/to/.boy-scout.json

import { HELP, parseArgs } from '../src/cli.js';
import { main } from '../src/main.js';

const { help, configPath, baseRef } = parseArgs(process.argv.slice(2));

if (help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const { code, lines, annotations } = main({ configPath, baseRef });

for (const line of lines) process.stdout.write(`${line}\n`);
for (const a of annotations) {
  process.stderr.write(`${typeof a === 'string' ? a : `${a.file}: ${a.message}`}\n`);
}

process.exit(code);
