import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse, stripComments, stripTrailingCommas } from '../src/json.js';
import { normalizeConfig, normalizeList, parseByFormat, parseJsonKeys, parseLines } from '../src/sources.js';

describe('parseJsonKeys', () => {
  it('returns the keys of a {path: count} baseline', () => {
    assert.deepEqual(parseJsonKeys('{"a.ts": 2, "b.ts": 1}'), ['a.ts', 'b.ts']);
  });

  it('returns [] for non-objects', () => {
    assert.deepEqual(parseJsonKeys('[]'), []);
    assert.deepEqual(parseJsonKeys('null'), []);
    assert.deepEqual(parseJsonKeys('{}'), []);
  });
});

describe('parseLines', () => {
  it('drops blanks and # comments, trimming the rest', () => {
    const text = '# a comment\n\n  src/a.ts  \nsrc/b.ts\n';
    assert.deepEqual(parseLines(text), ['src/a.ts', 'src/b.ts']);
  });

  it('returns [] for non-strings', () => {
    assert.deepEqual(parseLines(null), []);
  });
});

describe('parseByFormat', () => {
  it('dispatches on the named format', () => {
    assert.deepEqual(parseByFormat('json-keys', '{"a.ts":1}'), ['a.ts']);
    assert.deepEqual(parseByFormat('lines', 'a.ts'), ['a.ts']);
  });

  it('throws on an unknown format rather than silently passing', () => {
    assert.throws(() => parseByFormat('yaml', 'a'), /unknown format/);
  });
});

describe('JSON with comments', () => {
  it('strips line and block comments', () => {
    assert.equal(parse('{"a":1} // trailing').a, 1);
    assert.equal(parse('{/* hi */"a":1}').a, 1);
  });

  it('preserves // inside string literals', () => {
    assert.deepEqual(parseJsonKeys('{"https://x/y.ts": 1}'), ['https://x/y.ts']);
    assert.ok(stripComments('"a//b"').includes('//'));
  });

  it('survives an escaped quote inside a string', () => {
    assert.deepEqual(parse('{"a\\"b": 1}'), { 'a"b': 1 });
    assert.equal(stripTrailingCommas('"a\\",", 1'), '"a\\",", 1');
  });

  it('strips trailing commas before } and ]', () => {
    assert.deepEqual(parse('{"a":[1,2,],}'), { a: [1, 2] });
  });

  it('leaves ordinary commas alone', () => {
    assert.deepEqual(parse('{"a":1,"b":2}'), { a: 1, b: 2 });
  });
});

describe('normalizeList', () => {
  const base = { name: 'x', source: 'a.json' };

  it('defaults format to json-keys and frozen to true', () => {
    const l = normalizeList(base, 0);
    assert.equal(l.format, 'json-keys');
    assert.equal(l.frozen, true);
    assert.equal(l.command, null);
  });

  it('accepts frozen: false', () => {
    assert.equal(normalizeList({ ...base, frozen: false }, 0).frozen, false);
  });

  it('joins an array fix into lines', () => {
    assert.equal(normalizeList({ ...base, fix: ['one', 'two'] }, 0).fix, 'one\ntwo');
  });

  it('requires a name', () => {
    assert.throws(() => normalizeList({ source: 'a.json' }, 0), /name is required/);
  });

  it('requires exactly one of source or command', () => {
    assert.throws(() => normalizeList({ name: 'x' }, 0), /exactly one/);
    assert.throws(
      () => normalizeList({ name: 'x', source: 'a.json', command: 'ls' }, 0),
      /exactly one/
    );
  });

  it('rejects an unknown format', () => {
    assert.throws(() => normalizeList({ ...base, format: 'toml' }, 0), /unknown format/);
  });

  it('does not require a format for a command source', () => {
    const l = normalizeList({ name: 'x', command: 'ls' }, 0);
    assert.equal(l.source, null);
    assert.equal(l.format, null);
  });
});

describe('normalizeConfig', () => {
  it('normalizes a well-formed config', () => {
    const lists = normalizeConfig({ lists: [{ name: 'a', source: 'a.json' }] });
    assert.equal(lists.length, 1);
    assert.equal(lists[0].name, 'a');
  });

  it('rejects a missing or empty lists array', () => {
    assert.throws(() => normalizeConfig({}), /non-empty array/);
    assert.throws(() => normalizeConfig({ lists: [] }), /non-empty array/);
    assert.throws(() => normalizeConfig(null), /must be a JSON object/);
  });

  it('rejects duplicate list names', () => {
    assert.throws(
      () =>
        normalizeConfig({
          lists: [
            { name: 'a', source: 'a.json' },
            { name: 'a', source: 'b.json' },
          ],
        }),
      /duplicate list name/
    );
  });
});
