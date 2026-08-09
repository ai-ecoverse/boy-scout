import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizePath,
  parseBiomeJson,
  parseCheckstyle,
  parseEslintJson,
  parseSarif,
  parseTsc,
} from '../src/formats.js';

describe('normalizePath', () => {
  it('normalizes separators and strips a leading ./', () => {
    assert.equal(normalizePath('./src/a.ts'), 'src/a.ts');
    assert.equal(normalizePath('src\\a.ts'), 'src/a.ts');
  });

  it('makes a path under cwd repo-relative', () => {
    assert.equal(normalizePath('/repo/src/a.ts', '/repo'), 'src/a.ts');
    assert.equal(normalizePath('file:///repo/src/a.ts', '/repo'), 'src/a.ts');
  });

  it('leaves a path outside cwd alone', () => {
    assert.equal(normalizePath('/elsewhere/a.ts', '/repo'), '/elsewhere/a.ts');
  });

  it('returns null for empty input', () => {
    assert.equal(normalizePath(''), null);
    assert.equal(normalizePath(null), null);
  });
});

describe('parseEslintJson', () => {
  const report = JSON.stringify([
    { filePath: '/repo/src/dirty.js', messages: [{ ruleId: 'x', severity: 2 }] },
    { filePath: '/repo/src/warned.js', messages: [{ ruleId: 'y', severity: 1 }] },
    { filePath: '/repo/src/clean.js', messages: [] },
  ]);

  it('keeps only files that actually have messages', () => {
    // The whole point: ESLint reports every file it linted, clean ones too.
    // Taking keys blindly would freeze the entire codebase.
    assert.deepEqual(parseEslintJson(report, { cwd: '/repo' }), ['src/dirty.js', 'src/warned.js']);
  });

  it('filters to errors when severity is "error"', () => {
    assert.deepEqual(parseEslintJson(report, { cwd: '/repo', severity: 'error' }), [
      'src/dirty.js',
    ]);
  });

  it('returns [] for non-array input', () => {
    assert.deepEqual(parseEslintJson('{}'), []);
  });
});

describe('parseBiomeJson', () => {
  const report = JSON.stringify({
    diagnostics: [
      { severity: 'error', location: { path: 'src/a.ts' } },
      { severity: 'warning', location: { path: 'src/b.ts' } },
      { severity: 'error', location: { path: 'src/a.ts' } },
    ],
  });

  it('collects diagnostic paths, deduped', () => {
    assert.deepEqual(parseBiomeJson(report), ['src/a.ts', 'src/b.ts']);
  });

  it('filters by severity', () => {
    assert.deepEqual(parseBiomeJson(report, { severity: 'error' }), ['src/a.ts']);
  });

  it('tolerates a missing diagnostics array', () => {
    assert.deepEqual(parseBiomeJson('{}'), []);
  });
});

describe('parseSarif', () => {
  const report = JSON.stringify({
    runs: [
      {
        results: [
          {
            level: 'error',
            locations: [{ physicalLocation: { artifactLocation: { uri: 'src/a.ts' } } }],
          },
          {
            level: 'warning',
            locations: [{ physicalLocation: { artifactLocation: { uri: 'src/b.ts' } } }],
          },
        ],
      },
    ],
  });

  it('collects artifact URIs across runs', () => {
    assert.deepEqual(parseSarif(report), ['src/a.ts', 'src/b.ts']);
  });

  it('filters by level', () => {
    assert.deepEqual(parseSarif(report, { severity: 'error' }), ['src/a.ts']);
  });

  it('tolerates missing runs/results/locations', () => {
    assert.deepEqual(parseSarif('{}'), []);
    assert.deepEqual(parseSarif(JSON.stringify({ runs: [{}] })), []);
    assert.deepEqual(parseSarif(JSON.stringify({ runs: [{ results: [{}] }] })), []);
  });
});

describe('parseCheckstyle', () => {
  const xml = `<?xml version="1.0"?>
<checkstyle>
  <file name="src/dirty.ts"><error line="3" severity="error" message="bad"/></file>
  <file name="src/warned.ts"><error line="1" severity="warning" message="meh"/></file>
  <file name="src/clean.ts"></file>
  <file name="src/selfclosed.ts"/>
</checkstyle>`;

  it('keeps only files carrying at least one error element', () => {
    assert.deepEqual(parseCheckstyle(xml), ['src/dirty.ts', 'src/warned.ts']);
  });

  it('filters by severity attribute', () => {
    assert.deepEqual(parseCheckstyle(xml, { severity: 'error' }), ['src/dirty.ts']);
  });

  it('returns [] for non-string input', () => {
    assert.deepEqual(parseCheckstyle(null), []);
  });
});

describe('parseTsc', () => {
  const out = [
    "src/a.ts(12,3): error TS2345: Argument of type 'string' is not assignable.",
    'src/b.ts(1,1): warning TS6133: Declared but never read.',
    'src/a.ts(40,9): error TS2322: Type mismatch.',
    'Found 3 errors.',
  ].join('\n');

  it('extracts file paths, deduped', () => {
    assert.deepEqual(parseTsc(out), ['src/a.ts', 'src/b.ts']);
  });

  it('filters by severity', () => {
    assert.deepEqual(parseTsc(out, { severity: 'error' }), ['src/a.ts']);
  });

  it('ignores summary lines that name no file', () => {
    assert.deepEqual(parseTsc('Found 0 errors.'), []);
  });
});
