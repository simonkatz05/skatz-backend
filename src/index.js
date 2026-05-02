/**
 * index.js — fully fault-tolerant startup
 *
 * Goal: the server ALWAYS binds to PORT (even when migrations or env checks
 * fail) so Railway never 502s and we can diagnose errors via GET /health.
 */
const PORT = parseInt(process.env.PORT || '3001', 10);

// Boot a minimal Express server immediately so Railway sees the port bound.
// We'll swap it out for the real app once everything succeeds, or keep it
// serving diagnostic JSON if something goes wrong.
const express = require('express');
const minimal = express();

let startupStatus = { status: 'starting' };

minimal.get('/health', (_req, res) =>
  res.status(startupStatus.ok ? 200 : 503).json(startupStatus)
);
minimal.use((_req, res) =>
  res.status(503).json({ status: 'starting', message: 'Server is initialising, please retry shortly' })
);

const server = minimal.listen(PORT, () =>
  console.log(`[startup] Diagnostic server bound to port ${PORT}`)
);

async function boot() {
  // 1. Validate environment
  let envConfig;
  try {
    envConfig = require('./config/env');
    console.log('[startup] Environment validated');
  } catch (err) {
    startupStatus = { ok: false, status: 'env_error', error: err.message };
    console.error('[startup] ENV ERROR:', err.message);
    return; // keep diagnostic server running
  }

  // 2. Run migrations
  try {
    require('dotenv').config(); // no-op on Railway; safe to call again
    const { migrate } = require('./scripts/migrate');
    await migrate();
    console.log('[startup] Migrations complete');
  } catch (err) {
    startupStatus = { ok: false, status: 'migration_failed', error: err.message };
    console.error('[startup] MIGRATION FAILED:', err.message);
    return; // keep diagnostic server running
  }

  // 3. Load and mount the real app
  try {
    const app = require('./app');

    // Hand off: close the diagnostic server and let the real app take the port
    server.close(() => {
      app.listen(PORT, () => {
        startupStatus = { ok: true, status: 'ok' };
        console.log(`[startup] Skatz backend listening on port ${PORT}`);
      });
    });
  } catch (err) {
    startupStatus = { ok: false, status: 'app_load_failed', error: err.message };
    console.error('[startup] APP LOAD FAILED:', err.message);
  }
}

boot().catch(err => {
  startupStatus = { ok: false, status: 'fatal', error: err.message };
  console.error('[startup] FATAL:', err);
});
