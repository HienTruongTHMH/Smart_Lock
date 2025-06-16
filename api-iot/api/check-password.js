const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { password } = req.body;

  if (!password) {
    res.status(400).json({ error: "Password required" });
    return;
  }

  try {
    const result = await pool.query(
      'SELECT * FROM management WHERE pwd_private = $1 OR pwd_public = $1',
      [password]
    );
    
    res.json({ 
      valid: result.rows.length > 0,
      user: result.rows[0] || null
    });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: "Database error", detail: err.message });
  }
};