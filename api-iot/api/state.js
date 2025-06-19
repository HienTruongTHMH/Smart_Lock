import { Pool } from 'pg';
import { setupCors, handleOptions } from './_cors.js';
import { getRegistrationState, updateRegistrationState } from './state.js';

// Khởi tạo pool connection một lần
let pool;

export async function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

export async function getRegistrationState() {
  const pool = await getPool();
  const client = await pool.connect();
  
  try {
    // Tạo bảng state nếu chưa tồn tại
    await client.query(`
      CREATE TABLE IF NOT EXISTS "System_State" (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Lấy state hiện tại
    const result = await client.query(
      'SELECT value FROM "System_State" WHERE key = $1',
      ['registration_state']
    );
    
    if (result.rows.length === 0) {
      // Khởi tạo state mặc định
      const defaultState = {
        isActive: false,
        step: 'waiting',
        targetUserId: null,
        userData: null,
        password: null,
        uid: null,
        startTime: null
      };
      
      await client.query(
        'INSERT INTO "System_State" (key, value) VALUES ($1, $2)',
        ['registration_state', JSON.stringify(defaultState)]
      );
      
      return defaultState;
    }
    
    return result.rows[0].value;
  } finally {
    client.release();
  }
}

export async function updateRegistrationState(newState) {
  const pool = await getPool();
  const client = await pool.connect();
  
  try {
    await client.query(
      'UPDATE "System_State" SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
      [JSON.stringify(newState), 'registration_state']
    );
    
    return newState;
  } finally {
    client.release();
  }
}

export default async function handler(req, res) {
  setupCors(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Lấy state từ database
      const registrationState = await getRegistrationState();
      return res.json(registrationState);
    }

    if (req.method === 'POST') {
      const { action } = req.body;
      console.log('📨 Admin API action:', action, req.body);

      const pool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
      });

      switch (action) {
        case 'start_registration':
          return await startRegistration(req, res, pool);
        
        // Các case khác...
      }
    }
  } catch (error) {
    console.error('Admin API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      detail: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

async function startRegistration(req, res, pool) {
  console.log('🚀 Starting new user registration');
  
  // Lấy state hiện tại
  const currentState = await getRegistrationState();
  
  // Cập nhật state
  const newState = {
    isActive: true,
    step: 'password_input',
    targetUserId: null,
    userData: req.body.userData || null,
    password: null,
    uid: null,
    startTime: Date.now()
  };
  
  // Lưu state mới vào database
  await updateRegistrationState(newState);
  
  console.log('✅ Registration state updated:', newState);
  
  return res.json({ 
    success: true, 
    message: 'Registration started - ESP32 should enter password input mode',
    state: newState
  });
}