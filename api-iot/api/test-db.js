const { Pool } = require('pg');

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log('Testing database connection...');
  console.log('POSTGRES_URL exists:', !!process.env.POSTGRES_URL);

  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({ 
      success: false, 
      error: 'POSTGRES_URL environment variable not found'
    });
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    client.release();
    
    res.json({ 
      success: true, 
      message: 'Database connected successfully!',
      currentTime: result.rows[0].current_time,
      pgVersion: result.rows[0].pg_version.substring(0, 50)
    });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Database connection failed', 
      detail: err.message,
      code: err.code
    });
  }
}