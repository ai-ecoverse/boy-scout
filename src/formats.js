// Turning linter output into a set of offending files.
//
// Two families:
//
//   Structured  — the tool tells you exactly which files it complained about
//                 (eslint-json, biome-json, sarif, checkstyle, tsc). Precise,
//                 but you have to know the shape.
//   Heuristic   — `paths` scans arbitrary text for anything that looks like a
//                 file and keeps the ones that resolve to a real file in the
//                 repo. Imprecise by construction, but works with a tool
//                 nobody has written a parser for.
//
// Every parser returns repo-relative POSIX paths, deduped, in first-seen
// order.
//
// The trap that shapes most of this file: several reporters emit an entry for
// every file they INSPECTED, not every file they complained about. ESLint's
// JSON reporter lists clean files with `messages: []`; checkstyle emits empty
// `<file>` elements. Taking the keys blindly would put the whole codebase on
// the debt list and quietly freeze the repo. Each parser below keeps only
// files carrying at least one finding.

import { parse } from './json.js';

export const FORMATS = [
  'json-keys',
  'lines',
  'paths',
  'eslint-json',
  'biome-json',
  'sarif',
  'checkstyle',
  'tsc',
];

/** Formats that read a tool's output rather than a checked-in debt file. */
export const LINTER_FORMATS = new Set([
  'paths',
  'eslint-json',
  'biome-json',
  'sarif',
  'checkstyle',
  'tsc',
]);

/** Normalize separators, drop a leading `./`, and make repo-root-relative. */
export function normalizePath(raw, cwd = '') {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let p = raw.split('\\').join('/').trim();
  if (p.startsWith('file://')) p = p.slice('file://'.length);
  const root = cwd.split('\\').join('/').replace(/\/$/, '');
  if (root && p.startsWith(`${root}/`)) p = p.slice(root.length + 1);
  while (p.startsWith('./')) p = p.slice(2);
  return p.length > 0 ? p : null;
}

/** Collect into a deduped, order-preserving array. */
function collect(values, cwd) {
  const seen = new Set();
  const out = [];
  for (const v of values) {
    const p = normalizePath(v, cwd);
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/** True when a finding's severity clears the configured floor. */
function severityOk(actual, floor) {
  if (floor !== 'error') return true;
  return actual === 'error';
}

/**
 * ESLint `--format json`.
 * Skips files whose `messages` array is empty — those are the clean ones.
 */
export function parseEslintJson(text, { cwd = '', severity = 'any' } = {}) {
  const runs = parse(text);
  if (!Array.isArray(runs)) return [];
  const files = [];
  for (const entry of runs) {
    const messages = Array.isArray(entry?.messages) ? entry.messages : [];
    const kept = messages.filter((m) => severityOk(m?.severity === 2 ? 'error' : 'warning', severity));
    if (kept.length > 0) files.push(entry.filePath);
  }
  return collect(files, cwd);
}

/** Biome `--reporter=json`. */
export function parseBiomeJson(text, { cwd = '', severity = 'any' } = {}) {
  const payload = parse(text);
  const diagnostics = Array.isArray(payload?.diagnostics) ? payload.diagnostics : [];
  const files = diagnostics
    .filter((d) => severityOk(d?.severity, severity))
    .map((d) => d?.location?.path);
  return collect(files, cwd);
}

/**
 * SARIF 2.1.0 — the format GitHub itself ingests, so a great many tools can
 * emit it even when they have no dedicated parser here.
 */
export function parseSarif(text, { cwd = '', severity = 'any' } = {}) {
  const payload = parse(text);
  const runs = Array.isArray(payload?.runs) ? payload.runs : [];
  const files = [];
  for (const run of runs) {
    const results = Array.isArray(run?.results) ? run.results : [];
    for (const result of results) {
      // SARIF levels: none | note | warning | error.
      if (!severityOk(result?.level === 'error' ? 'error' : 'warning', severity)) continue;
      const locations = Array.isArray(result?.locations) ? result.locations : [];
      for (const loc of locations) {
        files.push(loc?.physicalLocation?.artifactLocation?.uri);
      }
    }
  }
  return collect(files, cwd);
}

// `<file name="src/a.ts">` … capture the element and its body so empty ones
// (files that were checked and came back clean) can be dropped.
const CHECKSTYLE_FILE_RE = /<file\b[^>]*\bname\s*=\s*"([^"]*)"[^>]*(\/>|>([\s\S]*?)<\/file>)/g;

/**
 * Checkstyle XML — emitted by ESLint, ruff, PMD, and many others.
 * Deliberately regex-based: a dependency-free XML parser is not worth it for
 * a shape this flat, and the elements we need are unambiguous.
 */
export function parseCheckstyle(text, { cwd = '', severity = 'any' } = {}) {
  if (typeof text !== 'string') return [];
  const files = [];
  for (const m of text.matchAll(CHECKSTYLE_FILE_RE)) {
    const body = m[3] ?? '';
    const findings = [...body.matchAll(/<error\b[^>]*>/g)];
    if (findings.length === 0) continue;
    if (severity === 'error') {
      const hasError = findings.some((f) => /\bseverity\s*=\s*"error"/.test(f[0]));
      if (!hasError) continue;
    }
    files.push(m[1]);
  }
  return collect(files, cwd);
}

// `src/a.ts(12,3): error TS2345: …` — also matches the `: error` form some
// tools use, and tolerates a leading absolute path.
const TSC_RE = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+[A-Z]+\d+:/gm;

/** TypeScript compiler diagnostics (`tsc --noEmit` default output). */
export function parseTsc(text, { cwd = '', severity = 'any' } = {}) {
  if (typeof text !== 'string') return [];
  const files = [];
  for (const m of text.matchAll(TSC_RE)) {
    if (!severityOk(m[4], severity)) continue;
    files.push(m[1]);
  }
  return collect(files, cwd);
}
