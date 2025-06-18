const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

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
    // Lấy tất cả mật khẩu đã mã hóa từ database
    const result = await pool.query(
      'SELECT id_user, "Full_Name", private_pwd FROM "Manager_Sign_In"'
    );

    for (let user of result.rows) {
      // So sánh mật khẩu nhập vào với mật khẩu đã mã hóa
      const isMatch = await bcrypt.compare(password, user.private_pwd);
      
      if (isMatch) {
        return res.json({
          valid: true,
          type: 'private',
          user: user.Full_Name
        });
      }
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