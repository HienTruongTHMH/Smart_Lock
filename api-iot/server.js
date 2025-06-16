const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Import API routes
const checkPassword = require('./api/check-password');
const checkUID = require('./api/check-uid');
const logAccess = require('./api/log-access');
const registerCard = require('./api/register-card');
const getCards = require('./api/get-cards');

// API Routes - Sửa lại để sử dụng đúng HTTP methods
app.post('/api/check-password', checkPassword);
app.post('/api/check-uid', checkUID);
app.post('/api/log-access', logAccess);
app.post('/api/register-card', registerCard);
app.get('/api/get-cards', getCards);

// Delete card route
app.delete('/api/delete-card/:id', async (req, res) => {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
  });

  try {
    await pool.query('DELETE FROM management WHERE id_user = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Database error", detail: err.message });
  }
});

// Test endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Smart Lock API is running!',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/check-password',
      'POST /api/check-uid', 
      'POST /api/log-access',
      'POST /api/register-card',
      'GET /api/get-cards'
    ]
  });
});

// Test database connection endpoint
app.get('/api/test-db', async (req, res) => {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
  });

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    client.release();
    
    res.json({ 
      success: true, 
      message: 'Database connected successfully!',
      currentTime: result.rows[0].current_time 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: 'Database connection failed', 
      detail: err.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API URL: http://localhost:${PORT}`);
  console.log(`🌐 Web interface: http://localhost:${PORT}/index.html`);
});

module.exports = app;