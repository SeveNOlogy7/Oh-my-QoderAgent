# Hooks

`hooks.json` registers one `UserPromptSubmit` command:

```text
node "${CLAUDE_PLUGIN_ROOT}/hooks/keyword-gate.mjs"
```

The gate is a no-op unless the project enables it:

- `.omq/config.json` → `"keyword_hook": true`
- `.qoder/config.json` → `"keyword_hook": true` or `"omq": { "keyword_hook": true }`

When disabled, it prints `{"continue":true,"suppressOutput":true}` and reads no
prompt content beyond the config check. When enabled, it only adds a
`hookSpecificOutput.additionalContext` hint for `ultrawork`, `team mode`, or
`hyperplan`. It never starts a workflow and never writes state.

Slash commands remain the zero-risk trigger path. The hook ignores any prompt
that already starts with `/`.

Tests: `tests/status-and-hook.test.mjs` covers disabled, enabled, and explicit
slash-command cases.
