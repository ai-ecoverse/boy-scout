// Pure matching helpers. No IO, no git, no Actions — all unit-tested.
//
// A debt-list entry is either a literal repo-relative path
// (`packages/webapp/src/cdp/browser-api.ts`) or a glob
// (`packages/webapp/src/**/*.ts`). Both are matched the same way, so a list
// can mix them freely.

/**
 * Convert an include-style glob into an anchored RegExp.
 * Supports `**` (zero or more path segments), `*` (any run of chars except
 * `/`), and `?` (one char except `/`). Every other regex metacharacter is
 * escaped and matched literally.
 */
export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^$(){}|[]\\'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

/** True when `filePath` matches any entry in `entries`. */
export function matchesAny(filePath, entries) {
  if (!Array.isArray(entries) || entries.length === 0) return false;
  return entries.some((e) => globToRegex(e).test(filePath));
}

/**
 * The changed files that are still on the debt list — the boy-scout
 * violations. Order follows `changedFiles`; deduped.
 */
export function findTouched(changedFiles, entries) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return [];
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const regexes = entries.map(globToRegex);
  const seen = new Set();
  const out = [];
  for (const file of changedFiles) {
    if (typeof file !== 'string' || file.length === 0) continue;
    if (seen.has(file)) continue;
    if (regexes.some((r) => r.test(file))) {
      seen.add(file);
      out.push(file);
    }
  }
  return out;
}

/**
 * Entries present in `current` but not in `base` — i.e. the list grew.
 * Order-preserving, deduped. Non-array inputs are treated as empty.
 */
export function findAdded(base, current) {
  const cur = Array.isArray(current) ? current : [];
  const baseSet = new Set(Array.isArray(base) ? base : []);
  const seen = new Set();
  const out = [];
  for (const e of cur) {
    if (typeof e !== 'string' || e.length === 0) continue;
    if (baseSet.has(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}
