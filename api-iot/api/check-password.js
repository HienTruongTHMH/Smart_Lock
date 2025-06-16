const { Pool } = require('pg');

// Kết nối tới NeonDB bằng connection string của bạn
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL, // Để bảo mật, dùng biến môi trường
});

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { password } = req.body;

  if (!password) {
    res.status(400).json({ error: "Password required" });
    return;
  }

  try {
    const result = await pool.query(
      'SELECT * FROM passwords WHERE pass = $1',
      [password]
    );
    res.json({ valid: result.rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: "Database error", detail: err.message });
  }
};