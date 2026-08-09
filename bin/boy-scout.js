#!/usr/bin/env node
// Local CLI — the same gate you get in CI, runnable before you push.
//
//   npx boy-scout                 # diff against the default base ref
//   npx boy-scout origin/develop  # diff against an explicit base ref
//   npx boy-scout --config path/to/.boy-scout.json

import { main } from '../src/main.js';

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(
    [
      'boy-scout — leave the campsite cleaner than you found it',
      '',
      'Usage: boy-scout [base-ref] [--config <path>]',
      '',
      "  base-ref        ref to diff against (default: $GITHUB_BASE_REF, $BASE_REF, or origin/main)",
      `  --config <path> config file (default: .boy-scout.json)`,
      '',
      'Exit codes: 0 clean · 1 violations · 2 misconfigured or unreadable',
      '',
    ].join('\n')
  );
  process.exit(0);
}

const configIndex = argv.indexOf('--config');
const configPath = configIndex >= 0 ? argv[configIndex + 1] : undefined;
const baseRef = argv.find((a, i) => !a.startsWith('-') && i !== configIndex + 1);

const { code, lines, annotations } = main({ configPath, baseRef });

for (const line of lines) process.stdout.write(`${line}\n`);
for (const a of annotations) {
  process.stderr.write(`${typeof a === 'string' ? a : `${a.file}: ${a.message}`}\n`);
}

process.exit(code);
