const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Để serve HTML file

// Import API routes
const checkPassword = require('./api/check-password');
const checkUID = require('./api/check-uid');
const logAccess = require('./api/log-access');
const registerCard = require('./api/register-card');
const getCards = require('./api/get-cards');

// API Routes
app.use('/api/check-password', checkPassword);
app.use('/api/check-uid', checkUID);
app.use('/api/log-access', logAccess);
app.use('/api/register-card', registerCard);
app.use('/api/get-cards', getCards);

// Test endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Smart Lock API is running!' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API URL: http://localhost:${PORT}`);
  console.log(`Web interface: http://localhost:${PORT}/index.html`);
});