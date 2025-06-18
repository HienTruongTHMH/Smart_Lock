const { Pool } = require('pg');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { method, identifier, success, timestamp } = req.body;

  if (!method || !identifier) {
    return res.status(400).json({ error: 'Method and identifier required' });
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    let userId = null;
    
    if (method === 'password') {
      const userResult = await pool.query(
        'SELECT id_user FROM "Manager_Sign_In" WHERE private_pwd = $1 OR public_pwd = $1',
        [identifier]
      );
      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id_user;
      }
    } else if (method === 'rfid') {
      const userResult = await pool.query(
        'SELECT id_user FROM "Manager_Sign_In" WHERE "UID" = $1',
        [identifier]
      );
      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id_user;
      }
    }

    if (userId && success) {
      // Log vào bảng time_tracking (nếu bảng này tồn tại)
      await pool.query(
        'INSERT INTO time_tracking (id_user, timestamp, method, status) VALUES ($1, $2, $3, $4)',
        [userId, new Date(timestamp * 1000), method, 'ĐÃ vào']
      );
    }

    return res.json({ success: true, logged: userId ? true : false });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}