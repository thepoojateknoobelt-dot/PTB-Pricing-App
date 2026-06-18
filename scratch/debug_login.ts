import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

async function main() {
  const email = 'admin@ptb.com';
  const password = 'admin';
  const loginIdentifier = email.split('@')[0];
  
  try {
    const normalizedUsername = loginIdentifier.toLowerCase().trim().replace(/\s+/g, '_');
    console.log('Querying database for:', normalizedUsername);
    
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1 OR username_lower = $2 OR username = $3',
      [normalizedUsername, normalizedUsername, loginIdentifier]
    );

    let user = result.rows[0];
    if (!user && normalizedUsername === 'admin') {
      const adminFallbackResult = await pool.query('SELECT * FROM users WHERE id = $1', ['admin_user']);
      user = adminFallbackResult.rows[0];
    }

    if (!user) {
      console.log('User not found.');
      return;
    }

    console.log('Found user in DB:', user);

    const isMatch = user.password.startsWith('$2') 
      ? bcrypt.compareSync(password, user.password)
      : password === user.password;

    console.log('Password match:', isMatch);

    const userPages = user.role === 'admin'
      ? ['dashboard', 'calculator', 'quotations', 'clients', 'reports', 'activity', 'users', 'config', 'production', 'nesting_dashboard', 'nesting_cutting', 'nesting_rolls_map', 'nesting_details', 'nesting_stock', 'nesting_production', 'nesting_scrub']
      : (user.allowed_pages || 'dashboard,calculator,quotations,clients').split(',');
    
    console.log('User pages calculated:', userPages);

    const token = jwt.sign({ 
      id: user.id, 
      username: user.username, 
      role: user.role, 
      name: user.name, 
      permission: user.permission || 'write',
      allowedPages: userPages
    }, JWT_SECRET);
    
    console.log('Token signed successfully!');
  } catch (err) {
    console.error('CRITICAL ERROR STACK:', err);
  } finally {
    await pool.end();
  }
}

main();
