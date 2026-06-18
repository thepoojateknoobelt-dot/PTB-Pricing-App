import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    console.log("Connecting to PostgreSQL...");
    const res = await pool.query("SELECT NOW()");
    console.log("Connected successfully! Server time:", res.rows[0]);
    
    // Check tables
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log("Tables in DB:", tables.rows.map(r => r.table_name));

    // Check cuts table columns
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'cuts'
    `);
    console.log("Cuts table columns:");
    console.log(columns.rows);
    
    await pool.end();
  } catch (err) {
    console.error("Database connection/query error:", err);
    process.exit(1);
  }
}

main();
