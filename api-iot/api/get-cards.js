const { Pool } = require('pg');
import { setupCors, handleOptions } from './_cors.js';

export default async function handler(req, res) {
  setupCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const result = await pool.query(
      'SELECT id_user, "Full_Name", "UID" FROM "Manager_Sign_In" ORDER BY id_user DESC'
    );

    return res.json({
      success: true,
      cards: result.rows
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}