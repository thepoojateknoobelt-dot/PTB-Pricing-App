import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:asif%40keshwani1234@35.154.73.173:5432/postgres?connect_timeout=10&sslmode=disable';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `);
    console.log("Tables:", tables.rows.map(r => r.table_name));

    if (tables.rows.some(r => r.table_name === 'companies')) {
      const companies = await pool.query("SELECT * FROM companies");
      console.log("Companies:", companies.rows);
    }
    
    if (tables.rows.some(r => r.table_name === 'system_config')) {
      const config = await pool.query("SELECT * FROM system_config");
      console.log("Config keys:", config.rows.map(r => r.id));
    }

    await pool.end();
  } catch (err) {
    console.error("Error:", err.message);
  }
}

main();
