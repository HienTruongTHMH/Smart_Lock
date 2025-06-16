const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const result = await pool.query(
      'SELECT id_user, user_name, uid, created_at FROM management ORDER BY created_at DESC'
    );

    res.json({ 
      success: true,
      cards: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: "Database error", detail: err.message });
  }
};