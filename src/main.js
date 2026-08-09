// The IO shell: read config, resolve every list at HEAD and at the base ref,
// hand the result to `inspect`, print the report. Shared by the GitHub Action
// entrypoint and the CLI.

import { changedFiles, readWorkingFile, resolveBaseRef, runCommand, showAtRef } from './git.js';
import { parse } from './json.js';
import { normalizeConfig, parseByFormat, parseLines } from './sources.js';
import { formatReport, inspect } from './run.js';

export const DEFAULT_CONFIG_PATH = '.boy-scout.json';

/**
 * Parse an explicit changed-file list (comma- or newline-separated).
 * Returns null when unset, so "unset" stays distinguishable from "empty".
 */
export function parseChangedFilesEnv(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** True on a CI event where a base-ref diff is not meaningful. */
export function shouldSkipEvent(env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true') return false;
  return !(env.GITHUB_EVENT_NAME === 'pull_request' || env.GITHUB_BASE_REF);
}

/**
 * @returns {{code: number, lines: string[], annotations: Array}}
 */
export function main({ cwd = process.cwd(), configPath, baseRef, env = process.env } = {}) {
  if (shouldSkipEvent(env)) {
    return { code: 0, lines: ['boy-scout: skipped (not a pull_request event)'], annotations: [] };
  }

  const path = configPath || env.INPUT_CONFIG || DEFAULT_CONFIG_PATH;
  const rawConfig = readWorkingFile(path, cwd);
  if (rawConfig === null) {
    return { code: 2, lines: [], annotations: [`no config file at ${path}`] };
  }

  let lists;
  try {
    lists = normalizeConfig(parse(rawConfig));
  } catch (err) {
    return { code: 2, lines: [], annotations: [`${path}: ${err.message}`] };
  }

  const base = resolveBaseRef(baseRef || env.INPUT_BASE_REF, env);

  // An explicit file list wins over the git diff, so the gate can be fed by an
  // earlier CI step (or a test) instead of recomputing the merge base.
  const explicit = parseChangedFilesEnv(env.CHANGED_FILES);

  let changed;
  try {
    changed = explicit ?? changedFiles(base, cwd);
  } catch (err) {
    return {
      code: 2,
      lines: [
        'Hint: check out with `fetch-depth: 0` so the merge-base can be resolved.',
      ],
      annotations: [`could not resolve changed files against ${base}: ${err.message}`],
    };
  }

  const readCurrent = (list) => {
    if (list.command) {
      const out = runCommand(list.command, cwd);
      if (out === null) return { error: `command failed: ${list.command}` };
      return { entries: parseLines(out) };
    }
    const text = readWorkingFile(list.source, cwd);
    if (text === null) return { error: `missing file: ${list.source}` };
    try {
      return { entries: parseByFormat(list.format, text) };
    } catch (err) {
      return { error: `${list.source}: ${err.message}` };
    }
  };

  const readBase = (list) => {
    // A command-sourced list has no addressable file at the base ref, so the
    // growth check cannot run for it. The touched check still applies.
    if (list.command) return { entries: [], readable: false };
    const text = showAtRef(base, list.source, cwd);
    if (text === null) return { entries: [], readable: false };
    try {
      return { entries: parseByFormat(list.format, text), readable: true };
    } catch {
      return { entries: [], readable: false };
    }
  };

  const result = inspect({ lists, changedFiles: changed, readCurrent, readBase });
  const { lines, annotations } = formatReport(result, changed);
  const hadError = result.results.some((r) => r.error);
  return { code: hadError ? 2 : result.ok ? 0 : 1, lines, annotations };
}
