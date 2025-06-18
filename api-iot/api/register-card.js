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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fullName, privatePassword, uid = null, source = 'web' } = req.body;

  // Chỉ yêu cầu tên và mật khẩu, UID optional
  if (!fullName || !privatePassword) {
    return res.status(400).json({ error: 'Full name and private password are required' });
  }

  // Validate 4-digit password
  if (privatePassword.length !== 4 || !/^\d{4}$/.test(privatePassword)) {
    return res.status(400).json({ error: 'Password must be exactly 4 digits' });
  }

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Check if UID already exists (chỉ khi có UID)
    if (uid && uid.trim() !== '') {
      const existing = await pool.query(
        'SELECT * FROM "Manager_Sign_In" WHERE "UID" = $1',
        [uid]
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'UID already exists' });
      }
    }

    // Mã hóa password trước khi lưu
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(privatePassword, saltRounds);

    // Insert new user (UID có thể null hoặc empty)
    const finalUID = (uid && uid.trim() !== '') ? uid : null;
    
    const result = await pool.query(
      'INSERT INTO "Manager_Sign_In" ("Full_Name", private_pwd, "UID") VALUES ($1, $2, $3) RETURNING *',
      [fullName, hashedPassword, finalUID]
    );

    return res.json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: result.rows[0].id_user,
        name: result.rows[0].Full_Name,
        uid: result.rows[0].UID || null,
        hasRFID: !!result.rows[0].UID,
        needsCard: !result.rows[0].UID
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