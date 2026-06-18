import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function main() {
  try {
    console.log('Testing connection to:', process.env.DATABASE_URL);
    const client = await pool.connect();
    console.log('Successfully connected to PG!');
    
    console.log('Querying users table...');
    const usersRes = await client.query('SELECT id, username, name, role FROM users');
    console.log('Users found:', usersRes.rows);
    
    client.release();
  } catch (err) {
    console.error('Database query failed:', err);
  } finally {
    await pool.end();
  }
}

main();
