const { Pool } = require('pg');
const { databaseUrl } = require('./env');

const pool = new Pool({ connectionString: databaseUrl });

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error', err);
  process.exit(1);
});

module.exports = pool;
