import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import fs from 'fs';
import pg from 'pg';

const { Pool } = pg;

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PostgreSQL connection pool optimized for AWS Lambda / RDS
const isLocal = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 5, // Safe concurrency limit for AWS Lambda
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

// Database schema auto-creation migration script
async function initializeDatabase() {
  try {
    console.log('Initializing database schema...');
    
    // Create Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) DEFAULT MD5(random()::text) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) DEFAULT 'User' NOT NULL,
        role VARCHAR(50) DEFAULT 'admin' NOT NULL,
        password VARCHAR(255) NOT NULL,
        username_lower VARCHAR(255) DEFAULT '' NOT NULL
      )
    `);

    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permission VARCHAR(50) DEFAULT 'write' NOT NULL`);
    } catch (alterErr) {
      console.warn('Failed to add permission column to users table:', alterErr);
    }

    // Create Clients table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        company VARCHAR(255) NOT NULL,
        city VARCHAR(255) NOT NULL,
        profit_margins JSONB NOT NULL
      )
    `);

    // Create System Config table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        id VARCHAR(50) PRIMARY KEY,
        data JSONB NOT NULL
      )
    `);

    // Create Quotations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quotations (
        id VARCHAR(255) PRIMARY KEY,
        client_id VARCHAR(255) NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        belt_type VARCHAR(255) NOT NULL,
        dimensions JSONB NOT NULL,
        joint_type VARCHAR(255),
        tape_type VARCHAR(255),
        total_cost NUMERIC NOT NULL,
        status VARCHAR(50) NOT NULL,
        discount_requested NUMERIC,
        discount_reason TEXT,
        rejection_reason TEXT,
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        audit_logs JSONB DEFAULT '[]'::jsonb
      )
    `);

    // Ensure joint_type and tape_type are nullable for legacy/custom calculations
    try {
      await pool.query(`ALTER TABLE quotations ALTER COLUMN joint_type DROP NOT NULL`);
      await pool.query(`ALTER TABLE quotations ALTER COLUMN tape_type DROP NOT NULL`);
    } catch (alterErr) {
      console.warn('Failed to alter quotations columns to drop NOT NULL constraint:', alterErr);
    }

    // Create Audit Logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(255) PRIMARY KEY,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        user_id VARCHAR(255) NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        action VARCHAR(255) NOT NULL,
        details TEXT NOT NULL
      )
    `);

    // Create Rolls table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rolls (
        id VARCHAR(255) PRIMARY KEY,
        material_type VARCHAR(255) NOT NULL,
        full_width NUMERIC NOT NULL,
        full_length NUMERIC NOT NULL,
        total_sqm NUMERIC NOT NULL,
        remaining_sqm NUMERIC NOT NULL,
        is_archived BOOLEAN DEFAULT FALSE NOT NULL
      )
    `);

    // Create Cuts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cuts (
        id VARCHAR(255) PRIMARY KEY,
        roll_id VARCHAR(255) REFERENCES rolls(id) ON DELETE CASCADE,
        order_id VARCHAR(255) NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        width NUMERIC NOT NULL,
        length NUMERIC NOT NULL,
        x NUMERIC NOT NULL,
        y NUMERIC NOT NULL,
        status VARCHAR(50) NOT NULL,
        color VARCHAR(50),
        is_inventory_cut BOOLEAN DEFAULT FALSE
      )
    `);

    console.log('Database schema checked/created successfully.');

    // Seed default admin user if none exists
    const adminCheck = await pool.query("SELECT * FROM users WHERE username = 'admin'");
    if (adminCheck.rowCount === 0) {
      console.log('No admin user found. Seeding default admin...');
      const adminPasswordHash = bcrypt.hashSync('admin', 10);
      await pool.query(`
        INSERT INTO users (id, username, name, role, password, username_lower)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['admin_user', 'admin', 'System Admin', 'admin', adminPasswordHash, 'admin']);
      console.log('Default admin seeded with password "admin".');
    }

    // Seed default config if none exists
    const configCountResult = await pool.query('SELECT COUNT(*) FROM system_config');
    if (parseInt(configCountResult.rows[0].count) === 0) {
      console.log('No system config found. Seeding defaults...');
      let defaultData = {};
      try {
        const localPath = path.join(process.cwd(), 'data', 'config.json');
        if (fs.existsSync(localPath)) {
          defaultData = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
        }
      } catch (err) {
        console.error('Failed to read local config.json, using minimal defaults', err);
      }
      
      if (Object.keys(defaultData).length === 0) {
        defaultData = {
          rates: { mesh: 10, fep: 20, thread: 5, pin: 15, packing: 50 },
          constants: { purchaseGst: 18, fixCost: 10, defaultProfit: 20, saleGst: 18 },
          beltTypes: [],
          jointTypes: [],
          tapeTypes: [],
          units: [{ id: 'mm', label: 'Millimeters', value: 'mm' }]
        };
      }

      await pool.query(`
        INSERT INTO system_config (id, data)
        VALUES ($1, $2)
      `, ['default', JSON.stringify(defaultData)]);
      console.log('Default system config seeded.');
    }
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
      console.warn('⚠️ Local PostgreSQL database offline (Connection Refused). Local API endpoints will run, database endpoints require active connection.');
    } else {
      console.error('Error during database initialization:', err);
    }
  }
}

// Trigger asynchronous database check on module load
initializeDatabase();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

app.use(express.json());
app.use(cookieParser());

// Dynamic CORS middleware to support S3 Static Website and Local Dev cross-origin requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Calculation Logic
const calculateCosting = (data: any, config: any, clientProfitRanges: any[] = [], customBOM: any[] = []) => {
  const { length, width, jointType, lengthUnit, widthUnit, manualPackingCost, manualProfitMargin } = data;
  const { rates, constants, jointTypes } = config;

  const toMeters = (val: number, u: string) => {
    if (u === 'mm') return val / 1000;
    if (u === 'ft') return val * 0.3048;
    if (u === 'in') return val * 0.0254;
    return val;
  };

  const lMtr = toMeters(parseFloat(length), lengthUnit);
  const wMtr = toMeters(parseFloat(width), widthUnit);

  const breakdown: any = {};
  let subtotal = 0;

  customBOM.forEach(item => {
    let consumption = 0;
    switch (item.formulaType) {
      case 'sqm': consumption = lMtr * wMtr; break;
      case 'running_l': consumption = 2 * lMtr; break;
      case 'running_w': consumption = 2 * wMtr; break;
      case 'thread': consumption = wMtr * 10 * 4 * 2; break;
      case 'pin': consumption = 2 * wMtr * 1.05; break;
      case 'joint': 
        const sj = jointTypes?.find((j: any) => j.name === jointType);
        consumption = (sj?.multiplier || 2) * wMtr; 
        break;
      case 'fixed': consumption = 1; break;
    }
    
    const cost = Math.round(consumption * item.rate);
    subtotal += cost;
    breakdown[item.name.toLowerCase().replace(/\s+/g, '_')] = {
      consumption,
      rate: item.rate,
      cost
    };
  });

  const packingCost = Math.round(manualPackingCost !== undefined ? parseFloat(manualPackingCost) : rates.packing);
  subtotal += packingCost;
  breakdown['packing'] = { consumption: 1, rate: manualPackingCost || rates.packing, cost: packingCost };

  const purchaseGstAmount = Math.round(subtotal * (constants.purchaseGst / 100));
  const totalWithPurchaseGst = Math.round(subtotal + purchaseGstAmount);
  
  const fixCostAmount = Math.round(totalWithPurchaseGst * (constants.fixCost / 100));
  const totalWithFixCost = Math.round(totalWithPurchaseGst + fixCostAmount);
  
  // Resolve profit margin based on length ranges
  let resolvedClientMargin = constants.defaultProfit;
  if (Array.isArray(clientProfitRanges) && clientProfitRanges.length > 0) {
    const applicableRange = clientProfitRanges.find(r => 
      lMtr >= r.minLength && (r.maxLength === null || lMtr < r.maxLength)
    );
    if (applicableRange) {
      resolvedClientMargin = applicableRange.margin;
    }
  }

  const profitMargin = manualProfitMargin || resolvedClientMargin;
  const profitAmount = Math.round(totalWithFixCost * (profitMargin / 100));
  const totalWithProfit = Math.round(totalWithFixCost + profitAmount);

  const saleGstAmount = Math.round(totalWithProfit * (constants.saleGst / 100));
  const finalTotal = Math.round(totalWithProfit + saleGstAmount);

  return {
    breakdown,
    summary: {
      subtotal,
      purchaseGst: purchaseGstAmount,
      totalWithPurchaseGst,
      fixCost: fixCostAmount,
      totalWithFixCost,
      profit: profitAmount,
      profitMarginUsed: profitMargin,
      totalWithProfit,
      saleGst: saleGstAmount,
      finalTotal
    }
  };
};

// API Routes
app.post('/api/calculate', (req, res) => {
  const { data, config, clientProfitRanges, bom, isAdmin } = req.body;
  const result = calculateCosting(data, config, clientProfitRanges, bom);
  
  if (!isAdmin) {
    // Hide breakdown for sales people
    return res.json({
      summary: {
        finalTotal: result.summary.finalTotal
      }
    });
  }
  
  res.json(result);
});

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  console.log('Login request received for:', req.body.username);
  const { username, password } = req.body;

  // Direct bypass check for admin/admin
  if (username === 'admin' && password === 'admin') {
    console.log('Login bypassed for admin/admin');
    const token = jwt.sign({ id: 'admin_user', username: 'admin', role: 'admin', name: 'System Admin', permission: 'write' }, JWT_SECRET);
    return res.cookie('token', token, { httpOnly: true }).json({ 
      user: { id: 'admin_user', username: 'admin', role: 'admin', name: 'System Admin', permission: 'write' } 
    });
  }

  try {
    const normalizedUsername = username.toLowerCase().trim().replace(/\s+/g, '_');
    
    // Select user from PG
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1 OR username_lower = $2 OR username = $3',
      [normalizedUsername, normalizedUsername, username]
    );

    let user = result.rows[0];
    if (!user && normalizedUsername === 'admin') {
      const adminFallbackResult = await pool.query('SELECT * FROM users WHERE id = $1', ['admin_user']);
      user = adminFallbackResult.rows[0];
    }

    if (!user) {
      console.warn('User not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = user.password.startsWith('$2') 
      ? bcrypt.compareSync(password, user.password)
      : password === user.password;

    if (!isMatch) {
      console.warn('Invalid password for user:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('Login successful for:', username);
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name, permission: user.permission || 'write' }, JWT_SECRET);
    res.cookie('token', token, { httpOnly: true }).json({ user: { id: user.id, username: user.username, role: user.role, name: user.name, permission: user.permission || 'write' } });
  } catch (error) {
    console.error('Login error on server:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token').json({ success: true });
});

app.get('/api/auth/me', authenticate, (req: any, res) => {
  res.json({ user: req.user });
});

// Config Settings Routes
app.get('/api/settings/config', async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM system_config WHERE id = $1', ['default']);
    const config = result.rows[0]?.data || null;
    res.json(config);
  } catch (err) {
    console.error('Failed to get config', err);
    res.status(500).json({ error: 'Failed to retrieve config' });
  }
});

app.post('/api/settings/config', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    await pool.query(
      'INSERT INTO system_config (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
      ['default', JSON.stringify(req.body)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to write config', err);
    res.status(500).json({ error: 'Failed to write config' });
  }
});

// Proxy endpoint to bypass CORS for AWS Lambda status verification
app.get('/api/aws-ping', async (req: any, res) => {
  const target = req.query.url;
  if (!target) {
    return res.status(400).json({ error: 'Missing URL parameter' });
  }
  try {
    const response = await fetch(target as string);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('CORS Bypass Proxy Error:', err);
    res.status(502).json({ error: 'AWS Lambda unreachable' });
  }
});

// Clients Routes
app.get('/api/clients', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients');
    const clients = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      company: row.company,
      city: row.city,
      profitMargins: row.profit_margins
    }));
    res.json(clients);
  } catch (err) {
    console.error('Failed to get clients', err);
    res.status(500).json({ error: 'Failed to retrieve clients' });
  }
});

app.post('/api/clients', authenticate, async (req, res) => {
  try {
    const id = Date.now().toString();
    const { name, company, city, profitMargins } = req.body;
    await pool.query(
      'INSERT INTO clients (id, name, company, city, profit_margins) VALUES ($1, $2, $3, $4, $5)',
      [id, name, company, city, JSON.stringify(profitMargins)]
    );
    res.json({ id, name, company, city, profitMargins });
  } catch (err) {
    console.error('Failed to create client', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

app.put('/api/clients/:id', authenticate, async (req, res) => {
  try {
    const { name, company, city, profitMargins } = req.body;
    const result = await pool.query(
      'UPDATE clients SET name = $1, company = $2, city = $3, profit_margins = $4 WHERE id = $5 RETURNING *',
      [name, company, city, JSON.stringify(profitMargins), req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Client not found' });
    const row = result.rows[0];
    res.json({
      id: row.id,
      name: row.name,
      company: row.company,
      city: row.city,
      profitMargins: row.profit_margins
    });
  } catch (err) {
    console.error('Failed to update client', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

app.delete('/api/clients/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete client', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// Beltcut Pro Rolls & Cuts Routes
app.get('/api/rolls', async (req, res) => {
  try {
    const rollsRes = await pool.query('SELECT * FROM rolls WHERE is_archived = false');
    const cutsRes = await pool.query('SELECT * FROM cuts');
    
    const rolls = rollsRes.rows.map(r => ({
      id: r.id,
      materialType: r.material_type,
      fullWidth: parseFloat(r.full_width),
      fullLength: parseFloat(r.full_length),
      totalSqm: parseFloat(r.total_sqm),
      remainingSqm: parseFloat(r.remaining_sqm),
      isArchived: r.is_archived,
      cuts: cutsRes.rows
        .filter(c => c.roll_id === r.id)
        .map(c => ({
          id: c.id,
          orderId: c.order_id,
          customerName: c.customer_name,
          width: parseFloat(c.width),
          length: parseFloat(c.length),
          x: parseFloat(c.x),
          y: parseFloat(c.y),
          status: c.status,
          color: c.color,
          isInventoryCut: c.is_inventory_cut
        }))
    }));
    res.json(rolls);
  } catch (err) {
    console.error('Failed to fetch rolls', err);
    res.status(500).json({ error: 'Failed to fetch rolls' });
  }
});

app.post('/api/rolls', async (req, res) => {
  const { id, materialType, fullWidth, fullLength, totalSqm, remainingSqm, isArchived } = req.body;
  try {
    await pool.query(
      `INSERT INTO rolls (id, material_type, full_width, full_length, total_sqm, remaining_sqm, is_archived) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, materialType, fullWidth, fullLength, totalSqm, remainingSqm, isArchived || false]
    );
    res.json({ id, materialType, fullWidth, fullLength, totalSqm, remainingSqm, isArchived: isArchived || false, cuts: [] });
  } catch (err) {
    console.error('Failed to create roll', err);
    res.status(500).json({ error: 'Failed to create roll' });
  }
});

app.put('/api/rolls/:id', async (req, res) => {
  const { remainingSqm } = req.body;
  try {
    await pool.query(
      'UPDATE rolls SET remaining_sqm = $1 WHERE id = $2',
      [remainingSqm, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update roll', err);
    res.status(500).json({ error: 'Failed to update roll' });
  }
});

app.delete('/api/rolls/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM rolls WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete roll', err);
    res.status(500).json({ error: 'Failed to delete roll' });
  }
});

app.post('/api/rolls/:rollId/cuts', async (req, res) => {
  const { id, orderId, customerName, width, length, x, y, status, color, isInventoryCut } = req.body;
  const rollId = req.params.rollId;
  try {
    await pool.query(
      `INSERT INTO cuts (id, roll_id, order_id, customer_name, width, length, x, y, status, color, is_inventory_cut) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, rollId, orderId, customerName, width, length, x, y, status, color, isInventoryCut || false]
    );
    res.json({ id, orderId, customerName, width, length, x, y, status, color, isInventoryCut });
  } catch (err) {
    console.error('Failed to save cut', err);
    res.status(500).json({ error: 'Failed to save cut' });
  }
});

// Quotations Routes
app.get('/api/quotations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM quotations');
    const quotations = result.rows.map(row => ({
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      beltType: row.belt_type,
      dimensions: row.dimensions,
      jointType: row.joint_type,
      tapeType: row.tape_type,
      totalCost: parseFloat(row.total_cost),
      status: row.status,
      discountRequested: row.discount_requested ? parseFloat(row.discount_requested) : undefined,
      discountReason: row.discount_reason,
      rejectionReason: row.rejection_reason,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      auditLogs: row.audit_logs
    }));
    res.json(quotations);
  } catch (err) {
    console.error('Failed to get quotations', err);
    res.status(500).json({ error: 'Failed to retrieve quotations' });
  }
});

app.post('/api/quotations', authenticate, async (req, res) => {
  try {
    const id = Date.now().toString();
    const { clientId, clientName, beltType, dimensions, jointType = '', tapeType = '', totalCost, status, discountRequested, discountReason, rejectionReason, createdBy, auditLogs } = req.body;
    const now = new Date();
    await pool.query(
      `INSERT INTO quotations (
        id, client_id, client_name, belt_type, dimensions, joint_type, tape_type, 
        total_cost, status, discount_requested, discount_reason, rejection_reason, 
        created_by, created_at, updated_at, audit_logs
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        id, clientId, clientName, beltType, JSON.stringify(dimensions), jointType || '', tapeType || '',
        totalCost, status, discountRequested || null, discountReason || null, rejectionReason || null,
        createdBy, now, now, JSON.stringify(auditLogs || [])
      ]
    );
    res.json({
      id, clientId, clientName, beltType, dimensions, jointType: jointType || '', tapeType: tapeType || '',
      totalCost, status, discountRequested, discountReason, rejectionReason,
      createdBy, createdAt: now.toISOString(), updatedAt: now.toISOString(), auditLogs: auditLogs || []
    });
  } catch (err) {
    console.error('Failed to create quotation', err);
    res.status(500).json({ error: 'Failed to create quotation' });
  }
});

app.put('/api/quotations/:id', authenticate, async (req, res) => {
  try {
    // 1. Get the existing quotation
    const existRes = await pool.query('SELECT * FROM quotations WHERE id = $1', [req.params.id]);
    if (existRes.rowCount === 0) return res.status(404).json({ error: 'Quotation not found' });
    const existing = existRes.rows[0];

    // 2. Merge request body with existing quotation
    const clientId = req.body.clientId !== undefined ? req.body.clientId : existing.client_id;
    const clientName = req.body.clientName !== undefined ? req.body.clientName : existing.client_name;
    const beltType = req.body.beltType !== undefined ? req.body.beltType : existing.belt_type;
    const dimensions = req.body.dimensions !== undefined ? req.body.dimensions : existing.dimensions;
    const jointType = req.body.jointType !== undefined ? req.body.jointType : existing.joint_type;
    const tapeType = req.body.tapeType !== undefined ? req.body.tapeType : existing.tape_type;
    const totalCost = req.body.totalCost !== undefined ? req.body.totalCost : existing.total_cost;
    const status = req.body.status !== undefined ? req.body.status : existing.status;
    const discountRequested = req.body.discountRequested !== undefined ? req.body.discountRequested : existing.discount_requested;
    const discountReason = req.body.discountReason !== undefined ? req.body.discountReason : existing.discount_reason;
    const rejectionReason = req.body.rejectionReason !== undefined ? req.body.rejectionReason : existing.rejection_reason;
    const createdBy = req.body.createdBy !== undefined ? req.body.createdBy : existing.created_by;
    const auditLogs = req.body.auditLogs !== undefined ? req.body.auditLogs : existing.audit_logs;

    const now = new Date();
    
    const result = await pool.query(
      `UPDATE quotations SET 
        client_id = $1, client_name = $2, belt_type = $3, dimensions = $4, 
        joint_type = $5, tape_type = $6, total_cost = $7, status = $8, 
        discount_requested = $9, discount_reason = $10, rejection_reason = $11, 
        created_by = $12, updated_at = $13, audit_logs = $14 
      WHERE id = $15 RETURNING *`,
      [
        clientId, clientName, beltType, typeof dimensions === 'string' ? dimensions : JSON.stringify(dimensions),
        jointType || '', tapeType || '', totalCost, status,
        discountRequested !== undefined && discountRequested !== null ? discountRequested : null,
        discountReason || null, rejectionReason || null,
        createdBy, now, typeof auditLogs === 'string' ? auditLogs : JSON.stringify(auditLogs || []), req.params.id
      ]
    );
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'Quotation not found' });
    const row = result.rows[0];
    res.json({
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      beltType: row.belt_type,
      dimensions: row.dimensions,
      jointType: row.joint_type,
      tapeType: row.tape_type,
      totalCost: parseFloat(row.total_cost),
      status: row.status,
      discountRequested: row.discount_requested ? parseFloat(row.discount_requested) : undefined,
      discountReason: row.discount_reason,
      rejectionReason: row.rejection_reason,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      auditLogs: row.audit_logs
    });
  } catch (err) {
    console.error('Failed to update quotation', err);
    res.status(500).json({ error: 'Failed to update quotation' });
  }
});

// Users Management Routes
app.get('/api/users', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const result = await pool.query('SELECT id, username, name, role, username_lower, permission FROM users');
    res.json(result.rows.map(row => ({
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      usernameLower: row.username_lower,
      permission: row.permission || 'write'
    })));
  } catch (err) {
    console.error('Failed to get users', err);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

app.post('/api/users', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { username, name, role, password, permission = 'write' } = req.body;
  
  try {
    const normalizedUsername = username.toLowerCase().trim().replace(/\s+/g, '_');
    
    const checkUser = await pool.query('SELECT 1 FROM users WHERE username_lower = $1', [normalizedUsername]);
    if (checkUser.rowCount! > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }
  
    const passwordHash = bcrypt.hashSync(password, 10);
    await pool.query(
      'INSERT INTO users (id, username, name, role, password, username_lower, permission) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [normalizedUsername, username, name, role, passwordHash, normalizedUsername, permission]
    );
    res.json({
      id: normalizedUsername,
      username,
      name,
      role,
      usernameLower: normalizedUsername,
      permission
    });
  } catch (err) {
    console.error('Failed to create user', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.delete('/api/users/:id', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete user', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Audit / Activity Logs Routes
app.get('/api/audit-logs', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const result = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100');
    res.json(result.rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      userId: row.user_id,
      userName: row.user_name,
      action: row.action,
      details: row.details
    })));
  } catch (err) {
    console.error('Failed to get audit logs', err);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

app.post('/api/audit-logs', authenticate, async (req: any, res) => {
  try {
    const id = Date.now().toString();
    const now = new Date();
    const { action, details } = req.body;
    await pool.query(
      'INSERT INTO audit_logs (id, timestamp, user_id, user_name, action, details) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, now, req.user.id, req.user.name || req.user.username, action, details]
    );
    res.json({
      id,
      timestamp: now.toISOString(),
      userId: req.user.id,
      userName: req.user.name || req.user.username,
      action,
      details
    });
  } catch (err) {
    console.error('Failed to create audit log', err);
    res.status(500).json({ error: 'Failed to create audit log' });
  }
});

// Vite Setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    
    // Serve index.html transformed by Vite for all non-api routes
    app.get('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(
          path.resolve(__dirname, 'index.html'),
          'utf-8'
        );
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export default app;
