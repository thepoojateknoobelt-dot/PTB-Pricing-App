import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    const res = await pool.query("SELECT * FROM users");
    console.log("Users in DB:", res.rows);
    await pool.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
