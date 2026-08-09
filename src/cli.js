// CLI argument parsing, kept out of bin/ so it is unit-testable.

export const HELP = [
  'boy-scout — leave the campsite cleaner than you found it',
  '',
  'Usage: boy-scout [base-ref] [--config <path>]',
  '',
  '  base-ref        ref to diff against',
  '                  (default: $GITHUB_BASE_REF, $BASE_REF, or origin/main)',
  '  --config <path> config file (default: .boy-scout.json)',
  '',
  'Exit codes: 0 clean · 1 violations · 2 misconfigured or unreadable',
  '',
].join('\n');

/**
 * Parse `[base-ref] [--config <path>]` in any order.
 * Returns `{ help, configPath, baseRef }`.
 */
export function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };

  const configIndex = argv.indexOf('--config');
  const configPath = configIndex >= 0 ? argv[configIndex + 1] : undefined;
  // The token right after `--config` is its value, not the base ref — but only
  // when `--config` is actually present. Without that guard `configIndex + 1`
  // is 0 and would swallow the first positional argument.
  const configValueIndex = configIndex >= 0 ? configIndex + 1 : -1;
  const baseRef = argv.find(
    (a, i) => !a.startsWith('-') && i !== configIndex && i !== configValueIndex
  );

  return { help: false, configPath, baseRef };
}
