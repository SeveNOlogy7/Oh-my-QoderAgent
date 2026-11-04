#!/usr/bin/env node
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readStatus, resolveProject } from '../tools/status-data.mjs';

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OMO Status</title>
  <style>
    :root { color-scheme: light dark; }
    body { font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin: 24px; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    pre { padding: 16px; border: 1px solid #8884; border-radius: 8px; overflow: auto; }
  </style>
</head>
<body>
  <h1>OMO Status</h1>
  <p>Read-only, loopback only. Refreshes every 5 seconds.</p>
  <pre id="root">Loading…</pre>
  <script>
    const token = new URLSearchParams(location.search).get('token') || '';
    async function refresh() {
      const target = document.getElementById('root');
      try {
        const response = await fetch('/api/status?token=' + encodeURIComponent(token));
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        target.textContent = JSON.stringify(data, null, 2);
      } catch (error) {
        target.textContent = 'Dashboard error: ' + error.message;
      }
    }
    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`;

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function tokenMatches(expected, provided) {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createDashboardServer({
  project = resolveProject(),
  token = randomBytes(24).toString('hex'),
  host = '127.0.0.1',
} = {}) {
  const server = createServer((request, response) => {
    const hostHeader = (request.headers.host ?? '').split(':')[0].toLowerCase();
    if (hostHeader !== '127.0.0.1' && hostHeader !== 'localhost') {
      json(response, 403, { error: 'forbidden_host' });
      return;
    }

    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET', 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }

    const url = new URL(request.url ?? '/', `http://${host}`);

    if (url.pathname === '/healthz') {
      json(response, 200, { ok: true });
      return;
    }

    if (url.pathname === '/') {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
      });
      response.end(HTML);
      return;
    }

    if (url.pathname === '/api/status') {
      const authorization = request.headers.authorization ?? '';
      const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      const provided = url.searchParams.get('token') ?? bearer;
      if (!tokenMatches(token, provided)) {
        json(response, 401, { error: 'unauthorized' });
        return;
      }
      json(response, 200, readStatus(project));
      return;
    }

    json(response, 404, { error: 'not_found' });
  });

  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  return { server, token, host };
}

export async function startDashboard(options = {}) {
  const { server, token, host } = createDashboardServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const url = `http://${host}:${port}/?token=${token}`;
  return {
    server,
    token,
    host,
    port,
    url,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  startDashboard({ project: resolveProject() })
    .then(({ url, port, token, server }) => {
      console.log(JSON.stringify({ url, port, token }));
      process.stderr.write(
        `OMO dashboard: ${url}\nRead-only; loopback only. Press Ctrl+C to stop.\n`,
      );
      const shutdown = () => server.close(() => process.exit(0));
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((error) => {
      process.stderr.write(`omo-dashboard: ${error.message}\n`);
      process.exit(1);
    });
}
