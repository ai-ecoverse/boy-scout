// Orchestration and reporting.
//
// The two rules, for every configured debt list:
//
//   1. Touched  — a changed file is still on the list. Pay that file's debt
//                 down in this same PR and delete its entry.
//   2. Grown    — the list gained entries versus the base ref. A frozen list
//                 may only shrink; adding to it is how debt becomes permanent.
//
// `inspect` is pure: it takes the changed files and two resolver callbacks, so
// the whole decision surface is unit-testable without git.

import { findAdded, findTouched } from './globs.js';

/**
 * @param {object} args
 * @param {Array} args.lists       normalized list descriptors
 * @param {string[]} args.changedFiles
 * @param {(list) => {entries?: string[], error?: string}} args.readCurrent
 * @param {(list) => {entries?: string[], readable: boolean}} args.readBase
 */
export function inspect({ lists, changedFiles, readCurrent, readBase }) {
  const results = [];
  for (const list of lists) {
    const current = readCurrent(list);
    if (current.error) {
      results.push({ list, error: current.error, touched: [], added: [], baseReadable: false });
      continue;
    }
    const entries = current.entries ?? [];
    const base = list.frozen ? readBase(list) : { entries: [], readable: false };
    // Bootstrapping: when the base has no entries for a list, the list is
    // being introduced in this very PR — every entry is "added", which is the
    // whole point of adding it. Skip the growth check in that case.
    const baseReadable = Boolean(base.readable) && (base.entries ?? []).length > 0;
    results.push({
      list,
      entries,
      touched: findTouched(changedFiles, entries),
      added: list.frozen && baseReadable ? findAdded(base.entries, entries) : [],
      baseReadable,
    });
  }
  const ok = results.every((r) => !r.error && r.touched.length === 0 && r.added.length === 0);
  return { results, ok };
}

const DEFAULT_FIX =
  'Fix: in this same PR, clear the file of the violations that put it on this\n' +
  'list, then delete its entry from the list.';
const DEFAULT_ADD_FIX =
  'Fix: clear the violation instead of adding the file to the list. The list is\n' +
  'frozen — it may only shrink.';

/**
 * Render the human-facing report. Returns `{ lines, annotations }`; the caller
 * decides where each goes (stderr, or GitHub `::error::` annotations).
 */
export function formatReport({ results, ok }, changedFiles) {
  const lines = [];
  const annotations = [];

  const errored = results.filter((r) => r.error);
  for (const r of errored) {
    annotations.push(`could not read the "${r.list.name}" debt list: ${r.error}`);
  }

  for (const r of results) {
    if (r.error || !r.list.frozen) continue;
    if (!r.baseReadable) {
      lines.push(
        `notice: no base entries for "${r.list.name}" — skipping its growth check ` +
          '(list is new, or the base ref is unavailable)'
      );
    }
  }

  if (ok) {
    const total = results.reduce((n, r) => n + (r.entries?.length ?? 0), 0);
    lines.push(
      `Scout's honor: ${changedFiles.length} changed file(s), ` +
        `0 still on any of ${results.length} debt list(s) (${total} entr(y|ies) tracked)`
    );
    return { lines, annotations };
  }

  lines.push('boy-scout: FAIL');

  for (const r of results) {
    if (r.touched.length === 0) continue;
    lines.push('');
    lines.push(`The following changed files are still on the "${r.list.name}" debt list`);
    lines.push(`(${r.list.source ?? r.list.command}):`);
    lines.push('');
    for (const f of r.touched) {
      lines.push(`  - ${f}  [${r.list.name}]`);
      annotations.push({ file: f, message: `still on the "${r.list.name}" debt list` });
    }
    lines.push('');
    lines.push(r.list.fix || DEFAULT_FIX);
  }

  for (const r of results) {
    if (r.added.length === 0) continue;
    lines.push('');
    lines.push(`The "${r.list.name}" debt list is frozen and must not grow; this PR adds:`);
    lines.push('');
    for (const e of r.added) lines.push(`  + ${e}  [${r.list.name}]`);
    lines.push('');
    lines.push(r.list.addFix || DEFAULT_ADD_FIX);
  }

  return { lines, annotations };
}
