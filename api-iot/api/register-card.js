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

  const { fullName, privatePassword, uid, source = 'web' } = req.body;

  if (!fullName || !privatePassword || !uid) {
    return res.status(400).json({ error: 'Full name, private password and UID are required' });
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Check if UID already exists
    const existing = await pool.query(
      'SELECT * FROM "Manager_Sign_In" WHERE "UID" = $1',
      [uid]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'UID already exists' });
    }

    // Insert new user (public_pwd mặc định là "0000")
    const result = await pool.query(
      'INSERT INTO "Manager_Sign_In" ("Full_Name", private_pwd, public_pwd, "UID") VALUES ($1, $2, $3, $4) RETURNING *',
      [fullName, privatePassword, "0000", uid]
    );

    return res.json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: result.rows[0].id_user,
        name: result.rows[0].Full_Name,
        uid: result.rows[0].UID
      },
      source: source
    });

  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}