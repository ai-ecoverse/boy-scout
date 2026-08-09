import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findAdded, findTouched, globToRegex, matchesAny } from '../src/globs.js';

describe('globToRegex', () => {
  it('matches a literal path exactly', () => {
    assert.ok(globToRegex('src/a.ts').test('src/a.ts'));
    assert.ok(!globToRegex('src/a.ts').test('src/a.ts.bak'));
    assert.ok(!globToRegex('src/a.ts').test('lib/src/a.ts'));
  });

  it('* does not cross a path separator', () => {
    assert.ok(globToRegex('src/*.ts').test('src/a.ts'));
    assert.ok(!globToRegex('src/*.ts').test('src/deep/a.ts'));
  });

  it('**/ spans zero or more segments', () => {
    const re = globToRegex('src/**/*.ts');
    assert.ok(re.test('src/a.ts'), 'zero segments');
    assert.ok(re.test('src/deep/nested/a.ts'), 'many segments');
  });

  it('? matches exactly one non-separator character', () => {
    assert.ok(globToRegex('src/a?.ts').test('src/ab.ts'));
    assert.ok(!globToRegex('src/a?.ts').test('src/a/.ts'));
    assert.ok(!globToRegex('src/a?.ts').test('src/abc.ts'));
  });

  it('escapes regex metacharacters instead of interpreting them', () => {
    assert.ok(globToRegex('src/a+b.ts').test('src/a+b.ts'));
    assert.ok(!globToRegex('src/a+b.ts').test('src/aab.ts'));
    assert.ok(globToRegex('src/(x).ts').test('src/(x).ts'));
    // A `.` in the glob must not match an arbitrary character.
    assert.ok(!globToRegex('src/a.ts').test('src/aXts'));
  });
});

describe('matchesAny', () => {
  it('is false for an empty or missing list', () => {
    assert.equal(matchesAny('a.ts', []), false);
    assert.equal(matchesAny('a.ts', undefined), false);
  });

  it('is true when any entry matches', () => {
    assert.equal(matchesAny('src/deep/a.ts', ['lib/**', 'src/**/*.ts']), true);
  });
});

describe('findTouched', () => {
  it('returns the changed files that sit on the list', () => {
    const changed = ['src/a.ts', 'src/b.ts', 'README.md'];
    assert.deepEqual(findTouched(changed, ['src/a.ts', 'docs/**']), ['src/a.ts']);
  });

  it('matches glob entries, not just literal paths', () => {
    assert.deepEqual(findTouched(['src/deep/a.ts'], ['src/**/*.ts']), ['src/deep/a.ts']);
  });

  it('dedupes and preserves changed-file order', () => {
    const changed = ['b.ts', 'a.ts', 'b.ts'];
    assert.deepEqual(findTouched(changed, ['*.ts']), ['b.ts', 'a.ts']);
  });

  it('is empty when either side is empty', () => {
    assert.deepEqual(findTouched([], ['a.ts']), []);
    assert.deepEqual(findTouched(['a.ts'], []), []);
    assert.deepEqual(findTouched(undefined, undefined), []);
  });
});

describe('findAdded', () => {
  it('returns entries present in current but not base', () => {
    assert.deepEqual(findAdded(['a.ts'], ['a.ts', 'b.ts']), ['b.ts']);
  });

  it('is empty when the list shrank or held steady', () => {
    assert.deepEqual(findAdded(['a.ts', 'b.ts'], ['a.ts']), []);
    assert.deepEqual(findAdded(['a.ts'], ['a.ts']), []);
  });

  it('dedupes and tolerates non-array input', () => {
    assert.deepEqual(findAdded([], ['a.ts', 'a.ts']), ['a.ts']);
    assert.deepEqual(findAdded(null, null), []);
  });
});
