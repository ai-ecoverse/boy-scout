// Turning a debt list on disk into a plain array of entries.
//
// Three shapes cover every debt list we have met in the wild:
//
//   json-keys  — a `{ "path/to/file.ts": 12, … }` ratchet baseline, where the
//                keys are the offenders and the values are counts. This is the
//                shape a "count may only go down" ratchet naturally produces.
//   lines      — a newline-delimited list of paths or globs. `#` comments and
//                blank lines are ignored.
//   command    — anything else. The repo prints its own debt list on stdout,
//                one entry per line, which lets a list live inside an
//                arbitrary config file the action knows nothing about.

import { parse } from './json.js';

export const FORMATS = ['json-keys', 'lines'];

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

/** Apply the named format to raw file contents. Unknown format → throws. */
export function parseByFormat(format, text) {
  if (format === 'json-keys') return parseJsonKeys(text);
  if (format === 'lines') return parseLines(text);
  throw new Error(`unknown format "${format}" (expected one of: ${FORMATS.join(', ')})`);
}

/**
 * Normalize one `lists[]` entry from the config into a validated descriptor.
 * Throws with a pointed message on malformed input — a misconfigured gate that
 * silently passes is worse than no gate.
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
  const format = raw.format ?? 'json-keys';
  if (hasFile && !FORMATS.includes(format)) {
    throw new Error(
      `${at} ("${name}") has unknown format "${format}" (expected one of: ${FORMATS.join(', ')})`
    );
  }
  return {
    name,
    source: hasFile ? raw.source : null,
    command: hasCommand ? raw.command : null,
    format: hasFile ? format : null,
    // A frozen list may not grow vs the base ref. Opt out for a list that is
    // legitimately allowed to gain entries (a generated inventory, say).
    frozen: raw.frozen !== false,
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
