const { Pool } = require('pg');

// Biến toàn cục để lưu trạng thái
let registrationState = {
  isActive: false,
  userData: null,
  step: 'waiting', // waiting, password_input, password_set, scanning, processing, completed
  privatePassword: null,
  scannedUID: null,
  timestamp: null
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // ESP32 check trạng thái
    return res.json(registrationState);
  }

  if (req.method === 'POST') {
    const { action, userData, password, uid } = req.body;

    switch (action) {
      case 'start':
        registrationState = {
          isActive: true,
          userData: userData,
          step: 'password_input',
          privatePassword: null,
          scannedUID: null,
          timestamp: new Date().toISOString()
        };
        return res.json({ success: true, message: 'Registration mode activated - waiting for password' });

      case 'set_password':
        if (registrationState.isActive && registrationState.step === 'password_input') {
          registrationState.privatePassword = password;
          registrationState.step = 'password_set';
          return res.json({ success: true, message: 'Password set, ready for card scan' });
        }
        return res.json({ success: false, message: 'Registration mode not ready for password' });

      case 'scan_uid':
        if (registrationState.isActive && registrationState.step === 'password_set') {
          registrationState.scannedUID = uid;
          registrationState.step = 'processing';
          return res.json({ success: true, message: 'UID scanned successfully' });
        }
        return res.json({ success: false, message: 'Registration mode not ready for card scan' });

      case 'complete':
        registrationState = {
          isActive: false,
          userData: null,
          step: 'completed',
          privatePassword: null,
          scannedUID: null,
          timestamp: new Date().toISOString()
        };
        return res.json({ success: true, message: 'Registration completed' });

      case 'cancel':
        registrationState = {
          isActive: false,
          userData: null,
          step: 'cancelled',
          privatePassword: null,
          scannedUID: null,
          timestamp: new Date().toISOString()
        };
        return res.json({ success: true, message: 'Registration cancelled' });

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}