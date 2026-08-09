import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseArgs } from '../src/cli.js';

describe('parseArgs', () => {
  it('reads a bare base ref', () => {
    // Regression: with no --config present, configIndex is -1 and a naive
    // `i !== configIndex + 1` check silently swallowed argv[0].
    assert.equal(parseArgs(['main']).baseRef, 'main');
    assert.equal(parseArgs(['origin/develop']).baseRef, 'origin/develop');
  });

  it('reads --config and does not mistake its value for the base ref', () => {
    const a = parseArgs(['--config', 'custom.json']);
    assert.equal(a.configPath, 'custom.json');
    assert.equal(a.baseRef, undefined);
  });

  it('reads both, in either order', () => {
    const a = parseArgs(['main', '--config', 'custom.json']);
    assert.equal(a.baseRef, 'main');
    assert.equal(a.configPath, 'custom.json');

    const b = parseArgs(['--config', 'custom.json', 'main']);
    assert.equal(b.baseRef, 'main');
    assert.equal(b.configPath, 'custom.json');
  });

  it('defaults both to undefined when no args are given', () => {
    const a = parseArgs([]);
    assert.equal(a.baseRef, undefined);
    assert.equal(a.configPath, undefined);
    assert.equal(a.help, false);
  });

  it('detects --help and -h', () => {
    assert.equal(parseArgs(['--help']).help, true);
    assert.equal(parseArgs(['-h']).help, true);
    assert.equal(parseArgs(['main', '--help']).help, true);
  });
});
