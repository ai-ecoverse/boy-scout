// JSON with comments and trailing commas — because real-world config files
// (`biome.json`, `tsconfig.json`, and every `.boy-scout.json` that wants to
// explain itself) have them, and `JSON.parse` does not.

/**
 * Strip `//` and block comments, then trailing commas, then parse.
 * String literals are preserved verbatim, so a `//` inside a glob survives.
 * Throws the underlying SyntaxError on genuinely malformed input.
 */
export function parse(text) {
  if (typeof text !== 'string') return null;
  return JSON.parse(stripTrailingCommas(stripComments(text)));
}

/** Remove line and block comments outside of string literals. */
export function stripComments(text) {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') {
        // Copy the escaped character verbatim so an escaped quote does not
        // look like the end of the string.
        if (next !== undefined) {
          out += next;
          i++;
        }
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === '/' && next === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlock = true;
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

/** Remove commas that sit directly before a closing `}` or `]`. */
export function stripTrailingCommas(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') {
        if (text[i + 1] !== undefined) {
          out += text[i + 1];
          i++;
        }
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === ',') {
      // Look ahead past whitespace for a closing bracket.
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') continue;
    }
    out += c;
  }
  return out;
}
