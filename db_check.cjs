const pg = require('pg');
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:asif%40keshwani1234@35.154.73.173:5432/postgres?connect_timeout=10&sslmode=disable'
});

async function main() {
  try {
    const res = await pool.query(`
      UPDATE cuts SET created_at = NOW() WHERE created_at IS NULL;
    `);
    console.log('Updated null created_at in cuts table. Row count:', res.rowCount);
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await pool.end();
  }
}

main();
