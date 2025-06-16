const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { uid } = req.body;

  if (!uid) {
    res.status(400).json({ error: "UID required" });
    return;
  }

  try {
    const result = await pool.query(
      'SELECT * FROM management WHERE uid = $1',
      [uid]
    );
    res.json({ valid: result.rows.length > 0, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Database error", detail: err.message });
  }
};