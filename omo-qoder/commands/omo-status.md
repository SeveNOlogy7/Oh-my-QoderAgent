---
description: "Render the .omq/ status board (read-only)"
---

# /omo-status

Run the read-only status renderer.

1. Resolve the plugin root from `QODER_PLUGIN_ROOT` or `CLAUDE_PLUGIN_ROOT`.
2. Run:

   ```bash
   node "$QODER_PLUGIN_ROOT/tools/omo-status.mjs"
   ```

3. Report the output exactly.
4. Do not modify `.omq/` or any other file.

The renderer reads `.omq/runtime/waves.json`, `.omq/config.json`, and
`.omq/evidence/`. It prints `Plan: none` when there is no active wave.
