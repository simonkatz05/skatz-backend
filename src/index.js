// Load env first so DATABASE_URL / JWT_SECRET are validated before anything else
const { port } = require('./config/env');
const { migrate } = require('./scripts/migrate');

async function start() {
  // Run migrations before starting the full server.
  // If they fail we still bind to PORT with a diagnostic endpoint so Railway
  // doesn't 502 and we can read the actual error via GET /health.
  let startupError = null;

  try {
    await migrate();
    console.log('Migrations complete — starting server');
  } catch (err) {
    startupError = err;
    console.error('STARTUP: migration failed —', err.message);
  }

  if (startupError) {
    // Minimal server so Railway sees the port and we can diagnose remotely
    const express = require('express');
    const minimal = express();
    minimal.get('/health', (_req, res) =>
      res.status(503).json({ status: 'startup_failed', error: startupError.message })
    );
    minimal.use((_req, res) =>
      res.status(503).json({ status: 'startup_failed', error: startupError.message })
    );
    minimal.listen(port, () =>
      console.log(`Diagnostic server listening on port ${port}`)
    );
    return;
  }

  const app = require('./app');
  app.listen(port, () => {
    console.log(`Skatz backend listening on port ${port}`);
  });
}

start().catch(err => {
  console.error('FATAL startup error:', err);
  process.exit(1);
});
