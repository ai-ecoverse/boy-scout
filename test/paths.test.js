import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { candidateFromToken, parsePaths } from '../src/paths.js';

describe('candidateFromToken', () => {
  it('strips a trailing :line:col', () => {
    assert.equal(candidateFromToken('src/a.ts:12:3'), 'src/a.ts');
    assert.equal(candidateFromToken('src/a.ts:12'), 'src/a.ts');
  });

  it('strips a trailing (line,col)', () => {
    assert.equal(candidateFromToken('src/a.ts(12,3)'), 'src/a.ts');
    assert.equal(candidateFromToken('src/a.ts(12)'), 'src/a.ts');
  });

  it('strips wrapping punctuation and a trailing colon', () => {
    assert.equal(candidateFromToken('src/a.ts:12:3:'), 'src/a.ts');
    assert.equal(candidateFromToken('(src/a.ts)'), 'src/a.ts');
    assert.equal(candidateFromToken('"src/a.ts",'), 'src/a.ts');
    assert.equal(candidateFromToken('[src/a.ts]'), 'src/a.ts');
  });

  it('rejects bare words with no separator or extension', () => {
    assert.equal(candidateFromToken('error'), null);
    assert.equal(candidateFromToken('warning'), null);
    assert.equal(candidateFromToken('TS2345'), null);
    assert.equal(candidateFromToken(''), null);
  });

  it('accepts a bare filename with an extension', () => {
    assert.equal(candidateFromToken('README.md'), 'README.md');
  });
});

describe('parsePaths', () => {
  // Injected probe: only these paths "exist".
  const real = new Set(['/repo/src/a.ts', '/repo/src/b.ts', '/repo/README.md']);
  const opts = { cwd: '/repo', isFile: (abs) => real.has(abs) };

  it('pulls paths out of grep-style linter output', () => {
    const out = [
      'src/a.ts:12:3: error  Unexpected any  @typescript-eslint/no-explicit-any',
      'src/b.ts:4:1: warning  Missing return type',
    ].join('\n');
    assert.deepEqual(parsePaths(out, opts), ['src/a.ts', 'src/b.ts']);
  });

  it('pulls paths out of tsc-style output', () => {
    const out = "src/a.ts(12,3): error TS2345: Argument of type 'string'.";
    assert.deepEqual(parsePaths(out, opts), ['src/a.ts']);
  });

  it('drops tokens that look like paths but do not exist', () => {
    // A rule id has a slash and would otherwise pass the shape test.
    const out = 'src/a.ts:1:1 error @typescript-eslint/no-explicit-any src/ghost.ts';
    assert.deepEqual(parsePaths(out, opts), ['src/a.ts']);
  });

  it('resolves absolute paths inside the repo and rejects those outside', () => {
    const out = '/repo/src/a.ts:1:1 error\n/etc/passwd:1:1 error';
    assert.deepEqual(parsePaths(out, opts), ['src/a.ts']);
  });

  it('rejects paths escaping the repo via ..', () => {
    assert.deepEqual(parsePaths('../outside/a.ts:1:1', opts), []);
  });

  it('dedupes, preserving first-seen order', () => {
    const out = 'src/b.ts:1:1\nsrc/a.ts:2:2\nsrc/b.ts:3:3';
    assert.deepEqual(parsePaths(out, opts), ['src/b.ts', 'src/a.ts']);
  });

  it('ignores build and dependency directories by default', () => {
    const withDeps = {
      cwd: '/repo',
      isFile: (abs) => real.has(abs) || abs === '/repo/node_modules/x/index.js',
    };
    const out = 'node_modules/x/index.js:1:1 error\nsrc/a.ts:1:1 error';
    assert.deepEqual(parsePaths(out, withDeps), ['src/a.ts']);
  });

  it('honours an extra ignore prefix', () => {
    const out = 'src/a.ts:1:1\nsrc/b.ts:1:1';
    assert.deepEqual(parsePaths(out, { ...opts, ignore: ['src/b'] }), ['src/a.ts']);
  });

  it('returns [] for empty or non-string input', () => {
    assert.deepEqual(parsePaths('', opts), []);
    assert.deepEqual(parsePaths(null, opts), []);
  });

  it('finds a path mentioned in prose, which is the known false-positive risk', () => {
    // Documented limitation: the heuristic cannot tell "has a violation" from
    // "was mentioned". A structured format should be preferred where one exists.
    assert.deepEqual(parsePaths('All clean, including README.md!', opts), ['README.md']);
  });
});
