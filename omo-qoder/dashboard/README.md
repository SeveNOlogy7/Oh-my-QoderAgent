# Dashboard

Optional read-only presentation layer.

Enable the profile flag:

```bash
node "$QODER_PLUGIN_ROOT/tools/omo-profile.mjs" enable dashboard
```

Start the server:

```bash
node "$QODER_PLUGIN_ROOT/dashboard/server.mjs"
```

It prints one JSON line with `{ url, port, token }` on stdout. The URL includes
the per-start token.

Properties:

- binds `127.0.0.1` only
- random port and a random 24-byte token at every start
- `/healthz` and the static `/` shell are token-free
- `/api/status` requires `?token=` or `Authorization: Bearer`
- every non-GET method returns 405
- unknown paths return 404
- no write or command channel; it never mutates `.omq/`
- fallback: `/omo-status`

Tests: `tests/dashboard.test.mjs` covers loopback binding, token gating,
read-only behavior, 405, and 404.
