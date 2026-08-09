// Turning a debt list into a plain array of entries.
//
// Two modes, and the difference matters:
//
//   Baseline mode — `source` points at a checked-in debt file (`json-keys`,
//                   `lines`). The list is frozen state, so BOTH rules apply:
//                   touching a listed file fails, and growing the list fails.
//
//   Live mode     — `command` runs a linter and its output IS the list
//                   (`paths`, `eslint-json`, `biome-json`, `sarif`,
//                   `checkstyle`, `tsc`). No baseline file to maintain, and
//                   the rule becomes "any file you touch must be clean".
//                   The growth check cannot run — there is no addressable
//                   file at the base ref to diff against.

import {
  FORMATS,
  LINTER_FORMATS,
  parseBiomeJson,
  parseCheckstyle,
  parseEslintJson,
  parseSarif,
  parseTsc,
} from './formats.js';
import { parse } from './json.js';
import { parsePaths } from './paths.js';

export { FORMATS, LINTER_FORMATS };

/** Keys of a `{ path: count }` baseline object. Non-objects yield []. */
export function parseJsonKeys(text) {
  const value = parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value).filter((k) => typeof k === 'string' && k.length > 0);
}

/** Newline-delimited entries; `#` comments and blank lines dropped. */
export function parseLines(text) {
  if (typeof text !== 'string') return [];
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

const PARSERS = {
  'json-keys': parseJsonKeys,
  lines: parseLines,
  paths: parsePaths,
  'eslint-json': parseEslintJson,
  'biome-json': parseBiomeJson,
  sarif: parseSarif,
  checkstyle: parseCheckstyle,
  tsc: parseTsc,
};

/**
 * Apply the named format to raw text.
 * @param {object} [ctx] `{ cwd, isFile, ignore, severity }` for the parsers
 *                       that need to resolve paths or filter findings.
 */
export function parseByFormat(format, text, ctx = {}) {
  const parser = PARSERS[format];
  if (!parser) {
    throw new Error(`unknown format "${format}" (expected one of: ${FORMATS.join(', ')})`);
  }
  return parser(text, ctx);
}

/**
 * Normalize one `lists[]` entry into a validated descriptor.
 * Throws with a pointed message on malformed input — a misconfigured gate
 * that silently passes is worse than no gate.
 */
export function normalizeList(raw, index) {
  const at = `lists[${index}]`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${at} must be an object`);
  }
  const name = raw.name;
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`${at}.name is required`);
  }
  const hasFile = typeof raw.source === 'string' && raw.source.length > 0;
  const hasCommand = typeof raw.command === 'string' && raw.command.length > 0;
  if (hasFile === hasCommand) {
    throw new Error(`${at} ("${name}") needs exactly one of "source" or "command"`);
  }

  // A checked-in debt file defaults to the ratchet-baseline shape; a command's
  // output defaults to plain lines, which is what a bespoke script prints.
  const format = raw.format ?? (hasFile ? 'json-keys' : 'lines');
  if (!FORMATS.includes(format)) {
    throw new Error(
      `${at} ("${name}") has unknown format "${format}" (expected one of: ${FORMATS.join(', ')})`
    );
  }
  // A linter format describes tool OUTPUT. Pointing one at a checked-in file
  // is legal (a stored report), but pointing a baseline format at a command is
  // almost always a mistake worth naming.
  if (hasCommand && (format === 'json-keys')) {
    throw new Error(
      `${at} ("${name}") uses format "json-keys" with "command"; a command's output is ` +
        'a report, not a baseline — use "lines" or a linter format'
    );
  }

  const severity = raw.severity ?? 'any';
  if (severity !== 'any' && severity !== 'error') {
    throw new Error(`${at} ("${name}") has unknown severity "${severity}" (expected any | error)`);
  }

  return {
    name,
    source: hasFile ? raw.source : null,
    command: hasCommand ? raw.command : null,
    format,
    severity,
    ignore: Array.isArray(raw.ignore) ? raw.ignore.filter((s) => typeof s === 'string') : [],
    // Only a checked-in file can be diffed against the base ref, so a
    // command-sourced list is never frozen regardless of what is configured.
    frozen: hasFile && raw.frozen !== false,
    fix: toText(raw.fix),
    addFix: toText(raw.addFix),
  };
}

/** Config `fix` / `addFix` accept a string or an array of lines. */
function toText(value) {
  if (Array.isArray(value)) return value.filter((l) => typeof l === 'string').join('\n');
  return typeof value === 'string' ? value : '';
}

/** Validate the whole config object and return the normalized lists. */
export function normalizeConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('config must be a JSON object');
  }
  const lists = config.lists;
  if (!Array.isArray(lists) || lists.length === 0) {
    throw new Error('config.lists must be a non-empty array');
  }
  const normalized = lists.map(normalizeList);
  const names = new Set();
  for (const l of normalized) {
    if (names.has(l.name)) throw new Error(`duplicate list name "${l.name}"`);
    names.add(l.name);
  }
  return normalized;
}
