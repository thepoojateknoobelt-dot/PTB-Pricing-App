import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://postgres:asif%40keshwani1234@35.154.73.173:5432/postgres?connect_timeout=10&sslmode=disable'
});

async function main() {
  try {
    const tables = ['rolls', 'cuts', 'quotations', 'users', 'clients', 'system_config', 'companies', 'material_stocks'];
    for (const t of tables) {
      const res = await pool.query(`SELECT COUNT(*) FROM ${t}`);
      console.log(`Table ${t}: ${res.rows[0].count} rows`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}
main();
