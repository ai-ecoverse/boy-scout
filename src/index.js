#!/usr/bin/env node
// GitHub Action entrypoint. Zero dependencies — no bundling, no `dist/`, no
// `npm ci` before the action can run.

import { appendFileSync } from 'node:fs';
import { main } from './main.js';

function annotate(a) {
  if (typeof a === 'string') return `::error::${a}`;
  const file = a.file ? ` file=${a.file}` : '';
  return `::error${file}::${a.message}`;
}

function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  try {
    appendFileSync(file, `${name}=${value}\n`);
  } catch {
    // A missing/unwritable output file must not mask the gate's verdict.
  }
}

const { code, lines, annotations } = main({});

for (const line of lines) process.stdout.write(`${line}\n`);
for (const a of annotations) process.stderr.write(`${annotate(a)}\n`);

setOutput('passed', code === 0 ? 'true' : 'false');
setOutput('violations', String(annotations.filter((a) => typeof a !== 'string').length));

process.exit(code);
