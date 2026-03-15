# Optimization

AI-powered campaign analysis and improvement suggestions. Works on any campaign -- hand-written, imported, or generated.

## Usage

```bash
ads optimize campaigns/search-dropbox.ts     # one campaign
ads optimize --all                            # all campaigns
ads optimize generated/ --filter '*.de.ts'   # subset by pattern
```

## Default analysis

Without a custom prompt, the optimizer covers common patterns:

**Google campaigns:**
- **Keyword-copy alignment** -- headlines should echo keyword language
- **Missing keywords** -- high-intent terms not yet covered
- **Negative gaps** -- missing negatives that waste budget
- **Ad copy quality** -- generic vs. specific headlines
- **Structure** -- ad group organization, budget balance

**Meta campaigns:**
- **Audience alignment** -- creative matches the target audience
- **Creative fatigue** -- signs that ad creative needs refresh
- **Interest relevance** -- targeting interests match the product

**Cross-campaign analysis** (with `--all`):
- Keyword cannibalization between campaigns
- Coverage gaps (markets or intents not targeted)
- Budget balance across campaigns

## Custom analysis prompt

Focus the analysis on what matters to you:

```bash
ads optimize campaigns/search-dropbox.ts \
  --prompt "Focus on competitor differentiation against Google Drive and OneDrive"
```

Or set a default in config:

```typescript
// ads.config.ts
ai: {
  model: anthropic('claude-sonnet-4-6'),
  optimize: {
    prompt: `Analyze from Renamed.to's perspective -- a niche AI file renaming
      tool. Flag anything a competitor could claim verbatim.`,
  },
}
```

The `--prompt` flag overrides the config default for that run.

## Output modes

### Default: terminal suggestions

```bash
ads optimize campaigns/search-dropbox.ts
```

Prints analysis and suggestions to the terminal as free-form text. Read, decide, act manually.

### `--interactive`: walk-through

```bash
ads optimize campaigns/search-dropbox.ts --interactive
```

Presents each suggestion one at a time. Accept or reject individually.

### `--apply`: auto-insert markers

```bash
ads optimize campaigns/search-dropbox.ts --apply
```

Applies mechanical edits automatically:
- Appends keywords to existing ad group arrays
- Adds missing negative keywords
- Inserts `ai.*` markers for new ad groups

Does **not** rewrite existing hand-written `rsa()` calls. Complex suggestions that can't be expressed as simple edits are printed as terminal suggestions instead.

After `--apply`, run `ads generate` to resolve any newly inserted `ai.*` markers.

### `--patch`: reviewable diff

```bash
ads optimize campaigns/search-dropbox.ts --patch
```

Outputs a patch file (`.optimize-patch.json`) with all suggested changes. Review it, then apply selectively.

## Workflow

A typical optimization cycle:

```bash
# 1. Analyze
ads optimize campaigns/search-dropbox.ts

# 2. Apply what makes sense
ads optimize campaigns/search-dropbox.ts --apply

# 3. Resolve new AI markers
ads generate campaigns/search-dropbox.ts

# 4. Review and deploy
ads plan
ads apply
```

## Flags reference

| Flag | Description |
|---|---|
| `--all` | Analyze all campaigns (enables cross-campaign analysis) |
| `--filter <glob>` | Filter campaigns by pattern |
| `--prompt "..."` | Custom analysis lens (overrides config default) |
| `--interactive` | Walk through suggestions one by one |
| `--apply` | Auto-apply mechanical edits, insert `ai.*` markers |
| `--patch` | Output a reviewable patch file |
