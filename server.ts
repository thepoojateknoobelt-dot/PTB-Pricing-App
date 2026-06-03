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

// PostgreSQL connection pool optimized with dynamic pooling and retry settings
const isLocal = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 10, // Ek sath 10 active connections khule rahenge
  idleTimeoutMillis: 30000, // 30 seconds tak idle rha toh hi band hoga
  connectionTimeoutMillis: 15000, // 15 seconds tak wait karega connect hone ke liye
});

// Handle pool errors to prevent application crash
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
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

    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_pages TEXT DEFAULT 'dashboard,calculator,quotations,clients' NOT NULL`);
    } catch (alterErr) {
      console.warn('Failed to add allowed_pages column to users table:', alterErr);
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

    // Ensure company column exists on quotations table
    try {
      await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS company VARCHAR(255)`);
    } catch (alterErr) {
      console.warn('Failed to add company column to quotations table:', alterErr);
    }

    // Ensure belt_style and selected_bom_options columns exist on quotations table
    try {
      await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS belt_style VARCHAR(255)`);
      await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS selected_bom_options JSONB DEFAULT '{}'::jsonb`);
    } catch (alterErr) {
      console.warn('Failed to add belt_style and selected_bom_options columns to quotations table:', alterErr);
    }

    // Create Companies table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL
      )
    `);

    // Prepopulate default company if table is empty
    try {
      const compCheck = await pool.query('SELECT COUNT(*) FROM companies');
      if (parseInt(compCheck.rows[0].count, 10) === 0) {
        await pool.query("INSERT INTO companies (id, name) VALUES ($1, $2)", ['comp-1', 'Pooja Tekno Belt']);
      }
    } catch (compErr) {
      console.warn('Failed to pre-populate default company:', compErr);
    }

    // Create Material Stocks table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS material_stocks (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        quantity NUMERIC NOT NULL DEFAULT 0,
        unit VARCHAR(50) DEFAULT 'pcs' NOT NULL
      )
    `);

    // Add reorder_level column if it doesn't exist yet
    try {
      await pool.query(`ALTER TABLE material_stocks ADD COLUMN IF NOT EXISTS reorder_level NUMERIC NOT NULL DEFAULT 0`);
    } catch (alterErr) {
      console.warn('Failed to add reorder_level column:', alterErr);
    }

    // Seed default material stocks if empty
    try {
      const stockCheck = await pool.query('SELECT COUNT(*) FROM material_stocks');
      if (parseInt(stockCheck.rows[0].count, 10) === 0) {
        await pool.query("INSERT INTO material_stocks (id, name, quantity, unit, reorder_level) VALUES ($1, $2, $3, $4, $5)", ['stock-1', 'Screws', 250, 'pcs', 50]);
        await pool.query("INSERT INTO material_stocks (id, name, quantity, unit, reorder_level) VALUES ($1, $2, $3, $4, $5)", ['stock-2', 'Clips', 120, 'pcs', 30]);
        await pool.query("INSERT INTO material_stocks (id, name, quantity, unit, reorder_level) VALUES ($1, $2, $3, $4, $5)", ['stock-3', 'Glue', 15, 'bottles', 5]);
      }
    } catch (stockErr) {
      console.warn('Failed to pre-populate default material stocks:', stockErr);
    }

    // Create Material Issues (Production Log) table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS material_issues (
        id VARCHAR(255) PRIMARY KEY,
        material_id VARCHAR(255) NOT NULL,
        material_name VARCHAR(255) NOT NULL,
        quantity NUMERIC NOT NULL,
        unit VARCHAR(50) NOT NULL,
        issued_to VARCHAR(255) NOT NULL,
        notes TEXT DEFAULT '',
        issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    // Schema alterations for reuse roll tracking
    try {
      await pool.query(`ALTER TABLE rolls ADD COLUMN IF NOT EXISTS is_reuse BOOLEAN DEFAULT FALSE`);
      await pool.query(`ALTER TABLE rolls ADD COLUMN IF NOT EXISTS parent_roll_id VARCHAR(255)`);
      await pool.query(`ALTER TABLE rolls ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'`);
      await pool.query(`UPDATE rolls SET is_reuse = TRUE WHERE id LIKE 'REUSE-%' AND is_reuse = FALSE`);
    } catch (alterErr) {
      console.warn('Failed to add columns to rolls table:', alterErr);
    }

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

const toMetersBackend = (val: number, u: string) => {
  if (!u) return val;
  const unit = u.toLowerCase();
  if (unit === 'mm' || unit === 'millimeters') return val / 1000;
  if (unit === 'ft' || unit === 'feet') return val * 0.3048;
  if (unit === 'in' || unit === 'inch' || unit === 'inches') return val * 0.0254;
  if (unit === 'mtr' || unit === 'm' || unit === 'meter' || unit === 'meters') return val;
  return val;
};

const evaluateFormulaBackend = (formula: string, L: number, W: number) => {
  try {
    if (!formula) return 0;
    const sanitized = formula.toUpperCase().replace(/\s/g, '');
    if (!/^[0-9LWP\.\+\-\*\/\(\)]+$/.test(sanitized)) return 0;
    
    const P = 2 * ((L || 0) + (W || 0));
    
    const expr = sanitized
      .replace(/L/g, `(${L || 0})`)
      .replace(/W/g, `(${W || 0})`)
      .replace(/P/g, `(${P})`);
    
    const result = Function(`"use strict"; return (${expr})`)();
    return isNaN(result) ? 0 : result;
  } catch (e) {
    console.error('Formula Error:', formula, e);
    return 0;
  }
};

async function deductStockForQuotation(quotationId: string, updateData: any) {
  try {
    const quoteRes = await pool.query('SELECT * FROM quotations WHERE id = $1', [quotationId]);
    if (quoteRes.rowCount === 0) return;
    const quote = quoteRes.rows[0];

    const beltType = updateData.beltType || quote.belt_type;
    const beltStyle = updateData.beltStyle || quote.belt_style;
    const dimensions = typeof quote.dimensions === 'string' ? JSON.parse(quote.dimensions) : quote.dimensions;
    const selectedBOMOptions = updateData.selectedBOMOptions || quote.selected_bom_options || {};

    if (!dimensions || !beltType || !beltStyle) {
      console.warn(`Cannot deduct stock for quotation ${quotationId}: missing dimensions, belt_type, or belt_style`);
      return;
    }

    const length = parseFloat(dimensions.length);
    const width = parseFloat(dimensions.width);
    const lengthUnit = dimensions.lengthUnit || dimensions.unit || 'mm';
    const widthUnit = dimensions.widthUnit || dimensions.unit || 'mm';

    const lMtr = toMetersBackend(length, lengthUnit);
    const wMtr = toMetersBackend(width, widthUnit);

    const configRes = await pool.query('SELECT data FROM system_config WHERE id = $1', ['default']);
    if (configRes.rowCount === 0) return;
    const config = configRes.rows[0].data;

    if (!config || !Array.isArray(config.beltTypes)) return;

    const category = config.beltTypes.find((t: any) => t.name === beltType);
    if (!category || !Array.isArray(category.styles)) return;
    const style = category.styles.find((s: any) => s.name === beltStyle);
    if (!style || !Array.isArray(style.bom)) return;

    for (const item of style.bom) {
      let linkedStockId = item.linkedStockId;
      let selectedOptionName = '';
      
      const optIdx = selectedBOMOptions[item.id];
      if (optIdx !== undefined && Array.isArray(item.options) && item.options[optIdx]) {
        const opt = item.options[optIdx];
        if (opt.linkedStockId) {
          linkedStockId = opt.linkedStockId;
        }
        selectedOptionName = opt.name || '';
      }

      if (!linkedStockId) continue;

      let consumption = evaluateFormulaBackend(item.formula || '', lMtr, wMtr);
      const u = (item.unit || '').toLowerCase();
      if (u === 'ft' || u === 'feet') consumption = consumption / 0.3048;
      else if (u === 'in' || u === 'inch' || u === 'inches') consumption = consumption / 0.0254;
      else if (u === 'mm' || u === 'millimeters') consumption = consumption * 1000;
      else if (u.includes('sq')) {
        if (u.includes('ft') || u.includes('feet')) consumption = consumption / (0.3048 * 0.3048);
        else if (u.includes('in') || u.includes('inch') || u.includes('inches')) consumption = consumption / (0.0254 * 0.0254);
        else if (u.includes('mm') || u.includes('millimeters')) consumption = consumption * (1000 * 1000);
      }

      const stockRes = await pool.query('SELECT * FROM material_stocks WHERE id = $1', [linkedStockId]);
      if (stockRes.rowCount === 0) continue;
      const stock = stockRes.rows[0];

      const deductQty = parseFloat(consumption.toFixed(4));
      const newQty = Math.max(0, parseFloat(stock.quantity) - deductQty);
      await pool.query('UPDATE material_stocks SET quantity = $1 WHERE id = $2', [newQty, linkedStockId]);

      const issueId = 'issue-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const issuedTo = `Order #${quote.id} (${quote.client_name})`;
      const note = `Auto-deducted on execution. Style: ${beltStyle}, BOM Component: ${item.name}${selectedOptionName ? ` (${selectedOptionName})` : ''}`;
      
      await pool.query(
        `INSERT INTO material_issues (id, material_id, material_name, quantity, unit, issued_to, notes, issued_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [issueId, linkedStockId, stock.name, deductQty, stock.unit, issuedTo, note]
      );
    }
  } catch (err) {
    console.error('Error in deductStockForQuotation:', err);
  }
}

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
    const token = jwt.sign({ 
      id: 'admin_user', 
      username: 'admin', 
      role: 'admin', 
      name: 'System Admin', 
      permission: 'write',
      allowedPages: ['dashboard', 'calculator', 'quotations', 'clients', 'reports', 'activity', 'users', 'config', 'production']
    }, JWT_SECRET);
    return res.cookie('token', token, { httpOnly: true }).json({ 
      user: { 
        id: 'admin_user', 
        username: 'admin', 
        role: 'admin', 
        name: 'System Admin', 
        permission: 'write',
        allowedPages: ['dashboard', 'calculator', 'quotations', 'clients', 'reports', 'activity', 'users', 'config', 'production']
      } 
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
    const userPages = user.role === 'admin'
      ? ['dashboard', 'calculator', 'quotations', 'clients', 'reports', 'activity', 'users', 'config', 'production']
      : (user.allowed_pages || 'dashboard,calculator,quotations,clients').split(',');
    
    const token = jwt.sign({ 
      id: user.id, 
      username: user.username, 
      role: user.role, 
      name: user.name, 
      permission: user.permission || 'write',
      allowedPages: userPages
    }, JWT_SECRET);
    res.cookie('token', token, { httpOnly: true }).json({ 
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        name: user.name, 
        permission: user.permission || 'write',
        allowedPages: userPages
      } 
    });
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

// Companies Routes
app.get('/api/companies', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM companies ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to get companies', err);
    res.status(500).json({ error: 'Failed to retrieve companies' });
  }
});

app.post('/api/companies', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const id = 'company-' + Date.now();
    await pool.query('INSERT INTO companies (id, name) VALUES ($1, $2)', [id, name.trim()]);
    res.json({ id, name: name.trim() });
  } catch (err) {
    console.error('Failed to add company', err);
    res.status(500).json({ error: 'Failed to add company' });
  }
});

app.put('/api/companies/:id', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    await pool.query('UPDATE companies SET name = $1 WHERE id = $2', [name.trim(), req.params.id]);
    res.json({ id: req.params.id, name: name.trim() });
  } catch (err) {
    console.error('Failed to update company', err);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

app.delete('/api/companies/:id', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    await pool.query('DELETE FROM companies WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete company', err);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

// Material Stocks Routes
app.get('/api/material-stocks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM material_stocks ORDER BY name ASC');
    res.json(result.rows.map(row => ({
      id: row.id,
      name: row.name,
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      reorderLevel: parseFloat(row.reorder_level) || 0
    })));
  } catch (err) {
    console.error('Failed to get material stocks', err);
    res.status(500).json({ error: 'Failed to retrieve material stocks' });
  }
});

app.post('/api/material-stocks', async (req: any, res) => {
  try {
    const { name, quantity, unit, reorderLevel } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const id = 'stock-' + Date.now();
    await pool.query(
      'INSERT INTO material_stocks (id, name, quantity, unit, reorder_level) VALUES ($1, $2, $3, $4, $5)', 
      [id, name.trim(), parseFloat(quantity) || 0, (unit || 'pcs').trim(), parseFloat(reorderLevel) || 0]
    );
    res.json({ id, name: name.trim(), quantity: parseFloat(quantity) || 0, unit: (unit || 'pcs').trim(), reorderLevel: parseFloat(reorderLevel) || 0 });
  } catch (err: any) {
    console.error('Failed to add material stock', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'A material with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to add material stock' });
  }
});

app.put('/api/material-stocks/:id', async (req: any, res) => {
  try {
    const { name, quantity, unit, reorderLevel } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    await pool.query(
      'UPDATE material_stocks SET name = $1, quantity = $2, unit = $3, reorder_level = $4 WHERE id = $5',
      [name.trim(), parseFloat(quantity) || 0, (unit || 'pcs').trim(), parseFloat(reorderLevel) || 0, req.params.id]
    );
    res.json({ id: req.params.id, name: name.trim(), quantity: parseFloat(quantity) || 0, unit: (unit || 'pcs').trim(), reorderLevel: parseFloat(reorderLevel) || 0 });
  } catch (err: any) {
    console.error('Failed to update material stock', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'A material with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to update material stock' });
  }
});

// PATCH – update only the reorder level for a stock item
app.patch('/api/material-stocks/:id/reorder-level', async (req: any, res) => {
  try {
    const { reorderLevel } = req.body;
    await pool.query(
      'UPDATE material_stocks SET reorder_level = $1 WHERE id = $2',
      [parseFloat(reorderLevel) || 0, req.params.id]
    );
    res.json({ success: true, reorderLevel: parseFloat(reorderLevel) || 0 });
  } catch (err) {
    console.error('Failed to update reorder level', err);
    res.status(500).json({ error: 'Failed to update reorder level' });
  }
});

// PATCH – increment stock quantity for an item (refill)
app.patch('/api/material-stocks/:id/refill', async (req: any, res) => {
  try {
    const { addQuantity } = req.body;
    if (addQuantity === undefined || isNaN(addQuantity) || parseFloat(addQuantity) <= 0) {
      return res.status(400).json({ error: 'Valid addQuantity is required' });
    }
    const result = await pool.query(
      'UPDATE material_stocks SET quantity = quantity + $1 WHERE id = $2 RETURNING *',
      [parseFloat(addQuantity), req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Material stock not found' });
    }
    const row = result.rows[0];
    res.json({
      id: row.id,
      name: row.name,
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      reorderLevel: parseFloat(row.reorder_level) || 0
    });
  } catch (err) {
    console.error('Failed to refill stock', err);
    res.status(500).json({ error: 'Failed to refill stock' });
  }
});

app.delete('/api/material-stocks/:id', async (req: any, res) => {
  try {
    await pool.query('DELETE FROM material_stocks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete material stock', err);
    res.status(500).json({ error: 'Failed to delete material stock' });
  }
});

// ─── Material Issues / Production Log Routes ──────────────────────────────

app.get('/api/material-issues', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM material_issues ORDER BY issued_at DESC');
    res.json(result.rows.map((row: any) => ({
      id: row.id,
      materialId: row.material_id,
      materialName: row.material_name,
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      issuedTo: row.issued_to,
      notes: row.notes || '',
      issuedAt: row.issued_at
    })));
  } catch (err) {
    console.error('Failed to get material issues', err);
    res.status(500).json({ error: 'Failed to retrieve production log' });
  }
});

app.post('/api/material-issues', async (req: any, res) => {
  try {
    const { materialId, materialName, quantity, unit, issuedTo, notes } = req.body;
    if (!materialName || !issuedTo) return res.status(400).json({ error: 'Material name and issued-to are required' });
    if (!quantity || quantity <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0' });

    if (materialId) {
      const stockRow = await pool.query('SELECT quantity FROM material_stocks WHERE id = $1', [materialId]);
      if (stockRow.rows.length > 0) {
        const newQty = Math.max(0, parseFloat(stockRow.rows[0].quantity) - parseFloat(quantity));
        await pool.query('UPDATE material_stocks SET quantity = $1 WHERE id = $2', [newQty, materialId]);
      }
    }

    const id = 'issue-' + Date.now();
    await pool.query(
      'INSERT INTO material_issues (id, material_id, material_name, quantity, unit, issued_to, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, materialId || '', materialName, parseFloat(quantity), unit || 'pcs', issuedTo.trim(), notes || '']
    );
    res.json({ id, materialId: materialId || '', materialName, quantity: parseFloat(quantity), unit: unit || 'pcs', issuedTo: issuedTo.trim(), notes: notes || '', issuedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Failed to create material issue', err);
    res.status(500).json({ error: 'Failed to issue material' });
  }
});

app.delete('/api/material-issues/:id', async (req: any, res) => {
  try {
    await pool.query('DELETE FROM material_issues WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete material issue', err);
    res.status(500).json({ error: 'Failed to delete record' });
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
      isReuse: r.is_reuse || (r.id && r.id.startsWith('REUSE-')) || false,
      parentRollId: r.parent_roll_id || null,
      status: r.status || 'active',
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
  const { id, materialType, fullWidth, fullLength, totalSqm, remainingSqm, isArchived, isReuse, parentRollId, status } = req.body;
  const computedIsReuse = isReuse || (id && id.startsWith('REUSE-')) || false;
  try {
    await pool.query(
      `INSERT INTO rolls (id, material_type, full_width, full_length, total_sqm, remaining_sqm, is_archived, is_reuse, parent_roll_id, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, materialType, fullWidth, fullLength, totalSqm, remainingSqm, isArchived || false, computedIsReuse, parentRollId || null, status || 'active']
    );
    res.json({ id, materialType, fullWidth, fullLength, totalSqm, remainingSqm, isArchived: isArchived || false, isReuse: computedIsReuse, parentRollId: parentRollId || null, status: status || 'active', cuts: [] });
  } catch (err) {
    console.error('Failed to create roll', err);
    res.status(500).json({ error: 'Failed to create roll' });
  }
});

app.put('/api/rolls/:id', async (req, res) => {
  const { remainingSqm, status } = req.body;
  try {
    if (status !== undefined) {
      await pool.query(
        'UPDATE rolls SET remaining_sqm = COALESCE($1, remaining_sqm), status = $2 WHERE id = $3',
        [remainingSqm, status, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE rolls SET remaining_sqm = $1 WHERE id = $2',
        [remainingSqm, req.params.id]
      );
    }
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

app.delete('/api/rolls/:rollId/cuts/:cutId', async (req, res) => {
  const { rollId, cutId } = req.params;
  try {
    const cutRes = await pool.query('SELECT * FROM cuts WHERE id = $1 AND roll_id = $2', [cutId, rollId]);
    if (cutRes.rowCount === 0) {
      return res.status(404).json({ error: 'Cut not found' });
    }
    const cut = cutRes.rows[0];
    const cutArea = parseFloat(cut.width) * parseFloat(cut.length);

    await pool.query('DELETE FROM cuts WHERE id = $1 AND roll_id = $2', [cutId, rollId]);

    const rollRes = await pool.query('SELECT * FROM rolls WHERE id = $1', [rollId]);
    if (rollRes.rowCount && rollRes.rowCount > 0) {
      const roll = rollRes.rows[0];
      const newRemainingSqm = parseFloat(roll.remaining_sqm) + cutArea;
      const totalSqm = parseFloat(roll.total_sqm);
      const finalRemaining = Math.min(totalSqm, newRemainingSqm);
      await pool.query('UPDATE rolls SET remaining_sqm = $1 WHERE id = $2', [finalRemaining, rollId]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete cut', err);
    res.status(500).json({ error: 'Failed to delete cut' });
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
      beltStyle: row.belt_style,
      selectedBOMOptions: typeof row.selected_bom_options === 'string' ? JSON.parse(row.selected_bom_options) : (row.selected_bom_options || {}),
      dimensions: typeof row.dimensions === 'string' ? JSON.parse(row.dimensions) : row.dimensions,
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
      auditLogs: typeof row.audit_logs === 'string' ? JSON.parse(row.audit_logs) : row.audit_logs,
      company: row.company
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
    const { clientId, clientName, beltType, beltStyle = '', selectedBOMOptions = {}, dimensions, jointType = '', tapeType = '', totalCost, status, discountRequested, discountReason, rejectionReason, createdBy, auditLogs, company } = req.body;
    const now = new Date();
    await pool.query(
      `INSERT INTO quotations (
        id, client_id, client_name, belt_type, dimensions, joint_type, tape_type, 
        total_cost, status, discount_requested, discount_reason, rejection_reason, 
        created_by, created_at, updated_at, audit_logs, company, belt_style, selected_bom_options
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        id, clientId, clientName, beltType, JSON.stringify(dimensions), jointType || '', tapeType || '',
        totalCost, status, discountRequested || null, discountReason || null, rejectionReason || null,
        createdBy, now, now, JSON.stringify(auditLogs || []), company || null, beltStyle || '', JSON.stringify(selectedBOMOptions || {})
      ]
    );
    res.json({
      id, clientId, clientName, beltType, beltStyle: beltStyle || '', selectedBOMOptions: selectedBOMOptions || {}, dimensions, jointType: jointType || '', tapeType: tapeType || '',
      totalCost, status, discountRequested, discountReason, rejectionReason,
      createdBy, createdAt: now.toISOString(), updatedAt: now.toISOString(), auditLogs: auditLogs || [],
      company
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
    const beltStyle = req.body.beltStyle !== undefined ? req.body.beltStyle : existing.belt_style;
    const selectedBOMOptions = req.body.selectedBOMOptions !== undefined ? req.body.selectedBOMOptions : existing.selected_bom_options;
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
    const company = req.body.company !== undefined ? req.body.company : existing.company;

    const oldStatus = existing.status;
    const newStatus = req.body.status !== undefined ? req.body.status : existing.status;

    // Perform stock deduction if transitioned to executed
    if (newStatus === 'executed' && oldStatus !== 'executed') {
      try {
        await deductStockForQuotation(req.params.id, req.body);
      } catch (stockErr) {
        console.error('Failed to deduct stock for quotation execution:', stockErr);
      }
    }

    const now = new Date();
    
    const result = await pool.query(
      `UPDATE quotations SET 
        client_id = $1, client_name = $2, belt_type = $3, dimensions = $4, 
        joint_type = $5, tape_type = $6, total_cost = $7, status = $8, 
        discount_requested = $9, discount_reason = $10, rejection_reason = $11, 
        created_by = $12, updated_at = $13, audit_logs = $14, company = $15,
        belt_style = $16, selected_bom_options = $17
      WHERE id = $18 RETURNING *`,
      [
        clientId, clientName, beltType, typeof dimensions === 'string' ? dimensions : JSON.stringify(dimensions),
        jointType || '', tapeType || '', totalCost, status,
        discountRequested !== undefined && discountRequested !== null ? discountRequested : null,
        discountReason || null, rejectionReason || null,
        createdBy, now, typeof auditLogs === 'string' ? auditLogs : JSON.stringify(auditLogs || []), 
        company || null,
        beltStyle || '',
        typeof selectedBOMOptions === 'string' ? selectedBOMOptions : JSON.stringify(selectedBOMOptions || {}),
        req.params.id
      ]
    );
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'Quotation not found' });
    const row = result.rows[0];
    res.json({
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      beltType: row.belt_type,
      beltStyle: row.belt_style,
      selectedBOMOptions: typeof row.selected_bom_options === 'string' ? JSON.parse(row.selected_bom_options) : row.selected_bom_options,
      dimensions: typeof row.dimensions === 'string' ? JSON.parse(row.dimensions) : row.dimensions,
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
      auditLogs: typeof row.audit_logs === 'string' ? JSON.parse(row.audit_logs) : row.audit_logs,
      company: row.company
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
    const result = await pool.query('SELECT id, username, name, role, username_lower, permission, allowed_pages FROM users');
    res.json(result.rows.map(row => ({
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      usernameLower: row.username_lower,
      permission: row.permission || 'write',
      allowedPages: row.role === 'admin'
        ? ['dashboard', 'calculator', 'quotations', 'clients', 'reports', 'activity', 'users', 'config', 'production']
        : (row.allowed_pages || 'dashboard,calculator,quotations,clients').split(',')
    })));
  } catch (err) {
    console.error('Failed to get users', err);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

app.post('/api/users', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { username, name, role, password, permission = 'write', allowedPages = ['dashboard', 'calculator', 'quotations', 'clients'] } = req.body;
  
  try {
    const normalizedUsername = username.toLowerCase().trim().replace(/\s+/g, '_');
    
    const checkUser = await pool.query('SELECT 1 FROM users WHERE username_lower = $1', [normalizedUsername]);
    if (checkUser.rowCount! > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }
  
    const passwordHash = bcrypt.hashSync(password, 10);
    const allowedPagesStr = Array.isArray(allowedPages) ? allowedPages.join(',') : 'dashboard,calculator,quotations,clients';
    await pool.query(
      'INSERT INTO users (id, username, name, role, password, username_lower, permission, allowed_pages) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [normalizedUsername, username, name, role, passwordHash, normalizedUsername, permission, allowedPagesStr]
    );
    res.json({
      id: normalizedUsername,
      username,
      name,
      role,
      usernameLower: normalizedUsername,
      permission,
      allowedPages: role === 'admin'
        ? ['dashboard', 'calculator', 'quotations', 'clients', 'reports', 'activity', 'users', 'config', 'production']
        : allowedPages
    });
  } catch (err) {
    console.error('Failed to create user', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', authenticate, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { name, role, permission, allowedPages } = req.body;
  try {
    const allowedPagesStr = Array.isArray(allowedPages) ? allowedPages.join(',') : 'dashboard,calculator,quotations,clients';
    const result = await pool.query(
      'UPDATE users SET name = $1, role = $2, permission = $3, allowed_pages = $4 WHERE id = $5 RETURNING id, username, name, role, permission, allowed_pages',
      [name, role, permission, allowedPagesStr, req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const row = result.rows[0];
    res.json({
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      permission: row.permission,
      allowedPages: row.role === 'admin'
        ? ['dashboard', 'calculator', 'quotations', 'clients', 'reports', 'activity', 'users', 'config', 'production']
        : (row.allowed_pages || '').split(',')
    });
  } catch (err) {
    console.error('Failed to update user', err);
    res.status(500).json({ error: 'Failed to update user' });
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
