const { Pool } = require('pg');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid } = req.body;

  if (!uid) {
    return res.status(400).json({ error: 'UID required' });
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const result = await pool.query(
      'SELECT * FROM "Manager_Sign_in" WHERE UPPER("UID") = UPPER($1)',
      [uid]
    );

    return res.json({
      valid: result.rows.length > 0,
      user: result.rows[0] || null
    });

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