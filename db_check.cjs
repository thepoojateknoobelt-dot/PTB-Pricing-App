const pg = require('pg');
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:asif%40keshwani1234@35.154.73.173:5432/postgres?connect_timeout=10&sslmode=disable'
});

async function main() {
  try {
    const res = await pool.query('SELECT * FROM clients');
    console.log('Clients count:', res.rows.length);
    console.log('Clients:', res.rows);
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await pool.end();
  }
}

main();
