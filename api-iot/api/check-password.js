const { Pool } = require('pg');

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Check public password
    const publicResult = await pool.query(
      'SELECT * FROM "Manager_Sign_In" WHERE public_pwd = $1 LIMIT 1',
      [password]
    );

    if (publicResult.rows.length > 0) {
      return res.json({
        valid: true,
        type: 'public',
        user: publicResult.rows[0].full_name
      });
    }

    // Check private password
    const privateResult = await pool.query(
      'SELECT * FROM "Manager_Sign_In" WHERE private_pwd = $1 LIMIT 1',
      [password]
    );

    if (privateResult.rows.length > 0) {
      return res.json({
        valid: true,
        type: 'private',
        user: privateResult.rows[0].full_name
      });
    }

    return res.json({ valid: false });

  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({
      error: 'Database error',
      detail: error.message
    });
  } finally {
    await pool.end();
  }
}