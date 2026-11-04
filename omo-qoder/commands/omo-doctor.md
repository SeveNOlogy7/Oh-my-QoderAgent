---
description: "Self-check the OMO for Qoder plugin: manifest, agents, skills, state isolation, and profiles"
---

# /omo-doctor

Run the plugin self-check. This command is read-only: do not modify files.

1. Resolve the plugin root. Use `QODER_PLUGIN_ROOT` when it is set. Otherwise
   locate the directory that contains this command's `.qoder-plugin/plugin.json`.
2. Run the doctor:

   ```bash
   node "$QODER_PLUGIN_ROOT/tools/omo-doctor.mjs"
   ```

   If the environment variable is empty, substitute the resolved plugin root.
3. Report the `PASS`/`FAIL` lines and the final summary exactly.
4. If any check fails, quote the failing line and stop. Do not attempt repairs
   unless the user explicitly asks.
