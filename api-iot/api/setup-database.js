const { Pool } = require('pg');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({ 
      success: false, 
      error: 'POSTGRES_URL environment variable not found'
    });
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    
    console.log('🔌 Creating database tables...');
    
    // Tạo bảng management
    await client.query(`
      CREATE TABLE IF NOT EXISTS management (
        id_user SERIAL PRIMARY KEY,
        user_name VARCHAR(100) NOT NULL,
        pwd_private VARCHAR(50) NOT NULL,
        pwd_public VARCHAR(50) NOT NULL,
        uid VARCHAR(20) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tạo bảng time_tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS time_tracking (
        id SERIAL PRIMARY KEY,
        id_user INTEGER REFERENCES management(id_user) ON DELETE CASCADE,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        method VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL,
        success BOOLEAN DEFAULT true
      )
    `);
    
    // Thêm dữ liệu mẫu
    await client.query(`
      INSERT INTO management (user_name, pwd_private, pwd_public, uid) 
      VALUES 
        ('Admin', '1234', '0000', '67A21405'),
        ('User Demo', '5678', '0000', 'ABCD1234')
      ON CONFLICT (uid) DO NOTHING
    `);
    
    // Kiểm tra dữ liệu
    const countResult = await client.query('SELECT COUNT(*) as count FROM management');
    const trackingCount = await client.query('SELECT COUNT(*) as count FROM time_tracking');
    
    client.release();
    
    res.json({ 
      success: true, 
      message: 'Database setup completed!',
      tablesCreated: ['management', 'time_tracking'],
      totalCards: parseInt(countResult.rows[0].count),
      totalLogs: parseInt(trackingCount.rows[0].count)
    });
    
  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Database setup failed', 
      detail: err.message 
    });
  }
}