import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatReport, inspect } from '../src/run.js';
import { parseChangedFilesEnv, shouldSkipEvent } from '../src/main.js';
import { normalizeList } from '../src/sources.js';

const list = (over = {}) => normalizeList({ name: 'debt', source: 'baseline.json', ...over }, 0);

/** inspect() with canned resolvers. */
function run({ entries = [], baseEntries = [], baseReadable = true, changed = [], over = {} }) {
  return inspect({
    lists: [list(over)],
    changedFiles: changed,
    readCurrent: () => ({ entries }),
    readBase: () => ({ entries: baseEntries, readable: baseReadable }),
  });
}

describe('inspect: touched rule', () => {
  it('passes when no changed file is on the list', () => {
    const r = run({ entries: ['a.ts'], baseEntries: ['a.ts'], changed: ['b.ts'] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.results[0].touched, []);
  });

  it('fails when a changed file is still on the list', () => {
    const r = run({ entries: ['a.ts'], baseEntries: ['a.ts'], changed: ['a.ts', 'b.ts'] });
    assert.equal(r.ok, false);
    assert.deepEqual(r.results[0].touched, ['a.ts']);
  });

  it('matches glob entries', () => {
    const r = run({ entries: ['src/**/*.ts'], baseEntries: ['src/**/*.ts'], changed: ['src/x/y.ts'] });
    assert.deepEqual(r.results[0].touched, ['src/x/y.ts']);
  });
});

describe('inspect: growth rule', () => {
  it('fails when a frozen list gains an entry', () => {
    const r = run({ entries: ['a.ts', 'b.ts'], baseEntries: ['a.ts'] });
    assert.equal(r.ok, false);
    assert.deepEqual(r.results[0].added, ['b.ts']);
  });

  it('passes when the list shrinks', () => {
    const r = run({ entries: ['a.ts'], baseEntries: ['a.ts', 'b.ts'] });
    assert.equal(r.ok, true);
  });

  it('skips the growth check when the base list is empty (bootstrapping)', () => {
    const r = run({ entries: ['a.ts', 'b.ts'], baseEntries: [] });
    assert.equal(r.ok, true);
    assert.equal(r.results[0].baseReadable, false);
  });

  it('skips the growth check when the base ref is unreadable', () => {
    const r = run({ entries: ['a.ts'], baseEntries: [], baseReadable: false });
    assert.equal(r.ok, true);
  });

  it('skips the growth check for a list marked frozen: false', () => {
    const r = run({ entries: ['a.ts', 'b.ts'], baseEntries: ['a.ts'], over: { frozen: false } });
    assert.equal(r.ok, true);
    assert.deepEqual(r.results[0].added, []);
  });
});

describe('inspect: unreadable list', () => {
  it('reports an error rather than passing silently', () => {
    const r = inspect({
      lists: [list()],
      changedFiles: ['a.ts'],
      readCurrent: () => ({ error: 'missing file: baseline.json' }),
      readBase: () => ({ entries: [], readable: false }),
    });
    assert.equal(r.ok, false);
    assert.match(r.results[0].error, /missing file/);
  });
});

describe('formatReport', () => {
  it("reports Scout's honor on a clean run", () => {
    const r = run({ entries: ['a.ts'], baseEntries: ['a.ts'], changed: ['b.ts'] });
    const { lines } = formatReport(r, ['b.ts']);
    assert.ok(lines.join('\n').includes("Scout's honor"));
  });

  it('names the touched file and emits a file annotation', () => {
    const r = run({ entries: ['a.ts'], baseEntries: ['a.ts'], changed: ['a.ts'] });
    const { lines, annotations } = formatReport(r, ['a.ts']);
    const text = lines.join('\n');
    assert.ok(text.includes('boy-scout: FAIL'));
    assert.ok(text.includes('a.ts'));
    assert.deepEqual(annotations[0], {
      file: 'a.ts',
      message: 'still on the "debt" debt list',
    });
  });

  it('uses the configured fix text when provided', () => {
    const r = run({
      entries: ['a.ts'],
      baseEntries: ['a.ts'],
      changed: ['a.ts'],
      over: { fix: 'Run the ratchet with --update.' },
    });
    assert.ok(formatReport(r, ['a.ts']).lines.join('\n').includes('Run the ratchet with --update.'));
  });

  it('falls back to default fix text when none is configured', () => {
    const r = run({ entries: ['a.ts'], baseEntries: ['a.ts'], changed: ['a.ts'] });
    assert.ok(formatReport(r, ['a.ts']).lines.join('\n').includes('clear the file'));
  });

  it('lists added entries when a frozen list grew', () => {
    const r = run({ entries: ['a.ts', 'b.ts'], baseEntries: ['a.ts'] });
    const text = formatReport(r, []).lines.join('\n');
    assert.ok(text.includes('must not grow'));
    assert.ok(text.includes('+ b.ts'));
  });

  it('emits a notice when the growth check is skipped', () => {
    const r = run({ entries: ['a.ts'], baseEntries: [] });
    assert.ok(formatReport(r, []).lines.join('\n').includes('skipping its growth check'));
  });
});

describe('parseChangedFilesEnv', () => {
  it('returns null when unset, so "unset" differs from "empty"', () => {
    assert.equal(parseChangedFilesEnv(undefined), null);
    assert.equal(parseChangedFilesEnv(''), null);
  });

  it('splits on commas and newlines, trimming entries', () => {
    assert.deepEqual(parseChangedFilesEnv('a.ts, b.ts\n c.ts '), ['a.ts', 'b.ts', 'c.ts']);
  });
});

describe('shouldSkipEvent', () => {
  it('does not skip outside GitHub Actions', () => {
    assert.equal(shouldSkipEvent({}), false);
  });

  it('runs on pull_request events', () => {
    assert.equal(
      shouldSkipEvent({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request' }),
      false
    );
    assert.equal(shouldSkipEvent({ GITHUB_ACTIONS: 'true', GITHUB_BASE_REF: 'main' }), false);
  });

  it('skips push and merge_group, which have no meaningful merge base', () => {
    assert.equal(shouldSkipEvent({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push' }), true);
    assert.equal(shouldSkipEvent({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'merge_group' }), true);
  });
});
