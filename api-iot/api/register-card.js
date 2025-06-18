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

  const { fullName, privatePassword, publicPassword, uid } = req.body;

  if (!fullName || !privatePassword || !publicPassword || !uid) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Check if UID already exists
    const existing = await pool.query(
      'SELECT * FROM "Manager_Sign_in" WHERE "UID" = $1',
      [uid]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'UID already exists' });
    }

    // Insert new card
    const result = await pool.query(
      'INSERT INTO "Manager_Sign_in" ("Full_Name", private_pwd, public_pwd, "UID") VALUES ($1, $2, $3, $4) RETURNING *',
      [fullName, privatePassword, publicPassword, uid]
    );

    return res.json({
      success: true,
      message: 'Card registered successfully',
      card: result.rows[0]
    });

  } catch (err) {
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}