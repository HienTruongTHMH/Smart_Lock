const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Import API routes
const checkPassword = require('./api/check-password');
const checkUID = require('./api/check-uid');
const logAccess = require('./api/log-access');
const registerCard = require('./api/register-card');
const getCards = require('./api/get-cards');

// API Routes
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
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await pool.query('DELETE FROM management WHERE id_user = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Database error", detail: err.message });
  }
});

// Test database connection endpoint
app.get('/api/test-db', async (req, res) => {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
      rejectUnauthorized: false
    }
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

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Smart Lock API is running!',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET / - API info',
      'GET /index.html - Web interface',
      'GET /api/test-db - Test database',
      'POST /api/check-password',
      'POST /api/check-uid', 
      'POST /api/log-access',
      'POST /api/register-card',
      'GET /api/get-cards',
      'DELETE /api/delete-card/:id'
    ]
  });
});

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Registration mode variables
let registrationMode = false;
let pendingRegistration = null;

// API to set registration mode
app.post('/api/set-registration-mode', (req, res) => {
  const { mode, userData } = req.body;
  registrationMode = mode;
  
  if (mode) {
    pendingRegistration = userData;
    console.log('Registration mode activated for:', userData);
  } else {
    pendingRegistration = null;
    console.log('Registration mode deactivated');
  }
  
  res.json({ success: true, registrationMode: mode });
});

// API to check registration mode
app.get('/api/register-mode', (req, res) => {
  res.json({ registrationMode: registrationMode });
});

// API to receive UID from ESP32
app.post('/api/send-uid', async (req, res) => {
  if (!registrationMode || !pendingRegistration) {
    res.status(400).json({ success: false, message: 'Not in registration mode' });
    return;
  }
  
  const { uid } = req.body;
  
  if (!uid) {
    res.status(400).json({ success: false, message: 'UID required' });
    return;
  }
  
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    // Check if UID already exists
    const existingCard = await pool.query(
      'SELECT * FROM management WHERE uid = $1',
      [uid]
    );
    
    if (existingCard.rows.length > 0) {
      res.json({ success: false, message: 'UID already exists' });
      return;
    }
    
    // Insert new card with pendingRegistration info
    const result = await pool.query(
      'INSERT INTO management (user_name, pwd_private, pwd_public, uid) VALUES ($1, $2, $3, $4) RETURNING *',
      [
        pendingRegistration.userName,
        pendingRegistration.privatePassword,
        pendingRegistration.publicPassword,
        uid
      ]
    );
    
    // Disable registration mode
    registrationMode = false;
    pendingRegistration = null;
    
    res.json({ 
      success: true, 
      message: 'Card registered successfully',
      card: result.rows[0]
    });
    
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Database error', 
      detail: err.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API URL: http://localhost:${PORT}`);
  console.log(`🌐 Web interface: http://localhost:${PORT}/index.html`);
  console.log(`🌐 Or just: http://localhost:${PORT}`);
});

module.exports = app;