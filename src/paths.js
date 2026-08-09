// The `paths` heuristic: find anything file-shaped in arbitrary text, keep
// what resolves to a real file inside the repo.
//
// This is what lets the gate consume a tool nobody wrote a parser for. It is
// also the one place where being wrong is expensive in the quiet direction: a
// false positive silently adds a file to the debt list, and the first anyone
// hears of it is a confusing CI failure on an unrelated PR. So the filter is
// deliberately conservative, and existence on disk does the heavy lifting —
// a token has to name a real file, inside the repo, to survive.
//
// It cannot distinguish "file with a violation" from "file merely mentioned".
// A tool that prints a summary line naming a clean file will put that file on
// the list. Prefer a structured format when one exists; this is the fallback.

import { statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { normalizePath } from './formats.js';

// Split on whitespace only — paths may contain almost anything else.
const WHITESPACE = /\s+/;

// Trailing location suffixes: `:12:34`, `:12`, `(12,34)`, `(12)`.
const LOCATION_SUFFIX = /(?::\d+(?::\d+)?|\((\d+)(?:,\d+)?\))$/;

// Wrapping punctuation a tool may put around a path.
const LEADING_JUNK = /^[('"`\[<]+/;
// Deliberately ONE character, not a greedy run: on `src/a.ts(12,3):` a greedy
// class would swallow the `)` along with the `:`, leaving `(12,3` unmatchable
// by LOCATION_SUFFIX. Peeling one char per pass lets the location pattern see
// a well-formed suffix.
const TRAILING_JUNK = /[)'"`\]>,;:.!?]$/;

/** Directories whose contents are never interesting as debt. */
const DEFAULT_IGNORED = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  'out/',
  'coverage/',
  'vendor/',
  'target/',
  '.venv/',
  '__pycache__/',
];

/**
 * Reduce one whitespace-delimited token to a candidate path, or null.
 * Strips wrapping punctuation and a trailing `:line:col` / `(line,col)`.
 */
export function candidateFromToken(token) {
  if (typeof token !== 'string') return null;
  let t = token.trim();
  if (t.length === 0) return null;

  t = t.replace(LEADING_JUNK, '');

  // Peel location suffixes and punctuation alternately until nothing changes.
  // A fixed order cannot work: stripping `)` first would break `(12,3)`
  // matching, while stripping the location first would miss `a.ts(12,3):`.
  for (let i = 0; i < 8; i++) {
    const before = t;
    t = t.replace(LOCATION_SUFFIX, '');
    t = t.replace(TRAILING_JUNK, '');
    if (t === before) break;
  }

  if (t.length === 0) return null;
  // A path must have a directory separator or an extension; this drops bare
  // words like "error", "warning", and rule names.
  if (!t.includes('/') && !t.includes('\\') && !/\.[A-Za-z0-9]+$/.test(t)) return null;
  // A rule id like `@typescript-eslint/no-explicit-any` has a slash but never
  // resolves on disk, so the existence check below discards it.
  return t;
}

/** Default existence probe: is this a regular file? */
function isFileOnDisk(abs) {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * Extract every file-shaped token from `text` that resolves to a real file
 * inside `cwd`. Returns deduped repo-relative POSIX paths in first-seen order.
 *
 * @param {object} opts
 * @param {string} opts.cwd            repo root
 * @param {(abs: string) => boolean} [opts.isFile]  injectable for tests
 * @param {string[]} [opts.ignore]     extra path prefixes to drop
 */
export function parsePaths(text, { cwd = process.cwd(), isFile = isFileOnDisk, ignore = [] } = {}) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const ignored = [...DEFAULT_IGNORED, ...ignore];
  const seen = new Set();
  const out = [];

  for (const token of text.split(WHITESPACE)) {
    const candidate = candidateFromToken(token);
    if (!candidate) continue;

    const normalized = normalizePath(candidate, cwd);
    if (!normalized) continue;

    // Reject anything that escapes the repo — absolute system paths, `../`.
    const abs = resolve(cwd, normalized);
    const rel = relative(cwd, abs).split('\\').join('/');
    if (rel.length === 0 || rel.startsWith('..')) continue;

    if (seen.has(rel)) continue;
    if (ignored.some((dir) => rel.startsWith(dir))) continue;
    if (!isFile(abs)) continue;

    seen.add(rel);
    out.push(rel);
  }

  return out;
}
