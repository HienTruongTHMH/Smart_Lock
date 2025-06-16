const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { method, identifier, success, timestamp } = req.body;

  if (!method || !identifier) {
    res.status(400).json({ error: "Method and identifier required" });
    return;
  }

  try {
    // Tìm user ID dựa trên method
    let userId = null;
    if (method === "password") {
      const userResult = await pool.query(
        'SELECT id_user FROM management WHERE pwd_private = $1 OR pwd_public = $1',
        [identifier]
      );
      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id_user;
      }
    } else if (method === "rfid") {
      const userResult = await pool.query(
        'SELECT id_user FROM management WHERE uid = $1',
        [identifier]
      );
      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id_user;
      }
    }

    if (userId && success) {
      // Log vào bảng time_tracking
      await pool.query(
        'INSERT INTO time_tracking (id_user, timestamp, method, status) VALUES ($1, $2, $3, $4)',
        [userId, new Date(timestamp * 1000), method, 'ĐÃ vào']
      );
    }

    res.json({ success: true, logged: userId ? true : false });
  } catch (err) {
    res.status(500).json({ error: "Database error", detail: err.message });
  }
};