const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

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
      // Trước tiên check local password (plaintext)
      const localPasswordResult = await pool.query(
        'SELECT id_user FROM "Manager_Sign_In" WHERE private_pwd = $1',
        [identifier]
      );
      
      if (localPasswordResult.rows.length > 0) {
        userId = localPasswordResult.rows[0].id_user;
      } else {
        // Nếu không match plaintext, check hashed passwords
        const allUsers = await pool.query(
          'SELECT id_user, private_pwd FROM "Manager_Sign_In"'
        );
        
        for (let user of allUsers.rows) {
          try {
            const isMatch = await bcrypt.compare(identifier, user.private_pwd);
            if (isMatch) {
              userId = user.id_user;
              break;
            }
          } catch (bcryptError) {
            // Ignore bcrypt errors for non-hashed passwords
            continue;
          }
        }
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
      // Sửa theo đúng cấu trúc bảng Time_Tracking
      await pool.query(
        'INSERT INTO "Time_Tracking" (id, "Time_Tracking", "Method", "Status") VALUES ($1, $2, $3, $4)',
        [userId, new Date(timestamp * 1000), method, true]
      );
    }

    return res.json({ success: true, logged: userId ? true : false });
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}