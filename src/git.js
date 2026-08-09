// The only module that talks to git or the filesystem.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function runGit(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`failed to run git: ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error((r.stderr || '').trim() || `git ${args.join(' ')} failed`);
  }
  return r.stdout.trim();
}

/**
 * Base ref to diff against, in precedence order: explicit argument,
 * `$GITHUB_BASE_REF` (set on `pull_request` events, needs the `origin/`
 * prefix), `$BASE_REF`, then `origin/main`.
 */
export function resolveBaseRef(explicit, env = process.env) {
  if (explicit) return explicit;
  if (env.GITHUB_BASE_REF) return `origin/${env.GITHUB_BASE_REF}`;
  if (env.BASE_REF) return env.BASE_REF;
  return 'origin/main';
}

/**
 * Files changed between the merge-base and the working tree. Diffing the
 * working tree (rather than `HEAD`) means the same command is useful locally
 * as a pre-push check, with uncommitted work included.
 */
export function changedFiles(baseRef, cwd) {
  const mergeBase = runGit(['merge-base', baseRef, 'HEAD'], cwd);
  return runGit(['diff', '--name-only', mergeBase], cwd)
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * A file's contents at `ref`, or null on ANY failure — missing ref, missing
 * file, shallow clone. Callers degrade to "no base list" rather than failing
 * the build on an infrastructure problem.
 */
export function showAtRef(ref, path, cwd) {
  try {
    return runGit(['show', `${ref}:${path}`], cwd);
  } catch {
    return null;
  }
}

/** Read a working-tree file, or null if it is missing/unreadable. */
export function readWorkingFile(path, cwd) {
  try {
    return readFileSync(resolve(cwd, path), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Run a debt-list command. Returns `{ stdout, failed }`.
 *
 * `failed` is reported rather than swallowed, but a non-zero exit is NOT
 * treated as an error by callers on its own: a linter exits non-zero
 * precisely when it found something, which is the case we care about. Only a
 * non-zero exit with no output at all means the command genuinely broke.
 */
export function runCommand(command, cwd) {
  const r = spawnSync(command, {
    cwd,
    encoding: 'utf-8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) return { stdout: '', failed: true };
  return { stdout: r.stdout ?? '', failed: r.status !== 0 };
}
