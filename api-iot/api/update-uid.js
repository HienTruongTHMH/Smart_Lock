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

  const { userId, uid } = req.body;

  if (!userId || !uid) {
    return res.status(400).json({ error: 'User ID and UID are required' });
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Check if UID already exists
    const existing = await pool.query(
      'SELECT * FROM "Manager_Sign_In" WHERE "UID" = $1 AND id_user != $2',
      [uid, userId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'UID already exists' });
    }

    // Update user UID
    const result = await pool.query(
      'UPDATE "Manager_Sign_In" SET "UID" = $1 WHERE id_user = $2 RETURNING *',
      [uid, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      success: true,
      message: 'UID updated successfully',
      user: {
        id: result.rows[0].id_user,
        name: result.rows[0].Full_Name,
        uid: result.rows[0].UID
      }
    });

  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}