require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    // Ensure migrations log table exists first
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let applied = 0;
    let skipped = 0;

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT filename FROM schema_migrations WHERE filename = $1',
        [file]
      );

      if (rows.length > 0) {
        console.log(`  skip  ${file}`);
        skipped++;
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations(filename) VALUES($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`  apply ${file}`);
        applied++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration failed (${file}): ${err.message}`);
      }
    }

    console.log(`\nDone — ${applied} applied, ${skipped} skipped.`);
  } finally {
    client.release();
    await pool.end();
  }
}

// Allow running directly: node src/scripts/migrate.js
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('MIGRATION ERROR:', err.message);
      process.exit(1);
    });
}

module.exports = { migrate };
