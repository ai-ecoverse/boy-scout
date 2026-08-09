# Boy Scout

[![100% Vibe_Coded](https://img.shields.io/badge/100%25-Vibe_Coded-ff69b4?style=for-the-badge&logo=claude&logoColor=white)](https://github.com/ai-ecoverse/vibe-coded-badge-action)

**The Boy Scouts of Slopmerica.** Leave the campsite cleaner than you found it.

A GitHub Action that enforces the boy-scout rule on your tech-debt lists: if you touch a file that is still on one, you pay that file's debt down in the same pull request. And the lists themselves are frozen — they may shrink, never grow.

## The problem

Every repo eventually grows a list of files that are exempt from a rule. A `biome.json` override block. A baseline JSON. A `# TODO: fix these` file. The list is created with the best intentions — *we'll get to these* — and then it does what lists do: it grows. Each new entry is individually reasonable and collectively fatal.

Slop accelerates this. Code arrives faster than anyone reads it, and the cheapest way past a failing rule is one more line in the exemption list. A gate that only checks *new* code is a gate that watches the list grow.

The boy-scout rule fixes the incentive. You are not asked to fix the whole list. You are asked to leave the part you touched cleaner than you found it — and the list is not allowed to grow behind your back.

## Related Projects

Part of the **[AI Ecoverse](https://github.com/ai-ecoverse/.github)** — a comprehensive ecosystem of tools for AI-assisted development:

- **[yolo](https://github.com/ai-ecoverse/yolo)** — AI CLI launcher with worktree isolation
- **[ai-aligned-git](https://github.com/ai-ecoverse/ai-aligned-git)** — Git wrapper for safe AI commit practices
- **[ai-aligned-gh](https://github.com/ai-ecoverse/ai-aligned-gh)** — GitHub CLI wrapper for proper AI attribution
- **[vibe-coded-badge-action](https://github.com/ai-ecoverse/vibe-coded-badge-action)** — Measure what percentage of your commits are AI
- **[gh-workflow-peek](https://github.com/ai-ecoverse/gh-workflow-peek)** — Smarter GitHub Actions log filtering
- **[as-a-bot](https://github.com/ai-ecoverse/as-a-bot)** — GitHub App token broker for proper AI attribution

## The two rules

| Rule | Fails when | Why |
| --- | --- | --- |
| **Touched** | a changed file is still on a debt list | You were in there anyway. Clean up your patch of campsite. |
| **Grown** | a frozen list has more entries than at the base ref | Adding to the list is how "temporary" becomes "forever". |

## Usage

```yaml
name: Boy Scout

on: pull_request

jobs:
  boy-scout:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # required — the gate needs a merge base
      - uses: ai-ecoverse/boy-scout@v1
```

That reads `.boy-scout.json` from the repo root. `fetch-depth: 0` is not optional: without full history there is no merge base, and the action exits 2 rather than pretending the tree is clean.

### Configuration

`.boy-scout.json` (comments and trailing commas are allowed):

```jsonc
{
  "lists": [
    {
      "name": "layer-back-edge",
      // A { "path/to/file.ts": 12, ... } ratchet baseline — the keys are the
      // offenders. This is the shape a "count may only go down" ratchet
      // naturally produces.
      "source": "tools/layer-back-edge-baseline.json",
      "format": "json-keys",
      "fix": [
        "Fix: remove every up-the-stack import from the file, then re-run:",
        "  node tools/check-layer-back-edges.mjs --update"
      ]
    },
    {
      "name": "cognitive-complexity",
      // Anything else: print the list yourself, one entry per line. This is
      // how a debt list buried in an arbitrary config file gets covered.
      "command": "node tools/list-debt.mjs cognitive-complexity",
      "fix": "Fix: bring every function in the file under the cap."
    }
  ]
}
```

#### List fields

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `name` | yes | — | Shown in failure output. Must be unique. |
| `source` | one of | — | Path to the debt-list file. Mutually exclusive with `command`. |
| `command` | one of | — | Shell command printing one entry per line. Mutually exclusive with `source`. |
| `format` | no | `json-keys` | `json-keys` (object keys) or `lines` (newline-delimited, `#` comments ignored). Applies to `source` only. |
| `frozen` | no | `true` | Whether the growth check runs. Set `false` for a list that is legitimately allowed to gain entries. |
| `fix` | no | generic text | Shown when a touched file is on the list. String or array of lines. |
| `addFix` | no | generic text | Shown when the list grew. String or array of lines. |

Entries may be literal paths or globs (`**`, `*`, `?`). A list can mix both.

### Inputs

| Input | Description | Required | Default |
| --- | --- | --- | --- |
| `config` | Path to the config file | no | `.boy-scout.json` |
| `base-ref` | Ref to diff against | no | `origin/$GITHUB_BASE_REF`, then `$BASE_REF`, then `origin/main` |

### Outputs

| Output | Description |
| --- | --- |
| `passed` | `"true"` when nothing is on a list and no list grew |
| `violations` | Number of changed files still sitting on a debt list |

## Locally, before you push

The same gate runs as a CLI, so the failure arrives before CI does:

```bash
npx @ai-ecoverse/boy-scout
npx @ai-ecoverse/boy-scout origin/develop
```

It diffs the **working tree** against the merge base, so uncommitted work counts too.

## What failure looks like

```
boy-scout: FAIL

The following changed files are still on the "record-string-unknown" debt list
(tools/record-string-unknown-baseline.json):

  - packages/webapp/src/cdp/browser-api.ts  [record-string-unknown]

Fix: in this same PR, replace every Record<string, unknown> in the file with a
named type for the shape you actually accept. Then ratchet the baseline:
  node tools/check-record-string-unknown.mjs --update
```

And success:

```
Scout's honor: 14 changed file(s), 0 still on any of 6 debt list(s) (722 entr(y|ies) tracked)
```

## Behaviour worth knowing

- **Non-PR events are skipped.** On `push` and `merge_group` there is no meaningful merge base, so the gate reports `skipped` and exits 0.
- **A new list bootstraps cleanly.** If the base ref has no entries for a list, every entry is trivially "added" — that is the point of adding it — so the growth check is skipped with a notice for that list.
- **Infrastructure failure is never silence.** A missing config, an unreadable list, or a command that exits non-zero produces exit code **2**, not a pass. A gate that fails open is not a gate.
- **`command` lists get the touched check only.** There is no addressable file at the base ref to compare against, so growth cannot be measured. This is stated in the output rather than hidden.

Exit codes: **0** clean · **1** violations · **2** misconfigured or unreadable.

## Zero dependencies

No `node_modules`, no bundling step, no `dist/` to keep in sync. The action is plain ES modules on Node 20+, and the tests run on `node --test`. You can read the whole thing in one sitting, which is rather the point for something that decides whether your PR merges.

## Prior art

The pattern was extracted from [SLICC](https://github.com/ai-ecoverse/slicc), where six separate debt lists — function size, cognitive complexity, floating promises, misused promises, layer-stack back-edges, and untyped string-keyed bags — are all gated this way.

## License

Apache-2.0
