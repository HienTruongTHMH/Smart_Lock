const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { userName, privatePassword, publicPassword, uid } = req.body;

  if (!userName || !privatePassword || !publicPassword || !uid) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }

  try {
    // Kiểm tra xem UID đã tồn tại chưa
    const existingCard = await pool.query(
      'SELECT * FROM management WHERE uid = $1',
      [uid]
    );

    if (existingCard.rows.length > 0) {
      res.status(400).json({ error: "UID already exists" });
      return;
    }

    // Thêm thẻ mới
    const result = await pool.query(
      'INSERT INTO management (user_name, pwd_private, pwd_public, uid) VALUES ($1, $2, $3, $4) RETURNING *',
      [userName, privatePassword, publicPassword, uid]
    );

    res.json({ 
      success: true, 
      message: "Card registered successfully",
      card: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: "Database error", detail: err.message });
  }
};