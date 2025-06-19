import { setupCors, handleOptions } from './_cors.js';

export default async function handler(req, res) {
  // ✅ Setup CORS
  setupCors(res);
  
  // ✅ Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { Pool } = require('pg');
  
  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({ error: 'Database connection not configured' });
  }

  // Global registration state
  let registrationState = {
    isActive: false,
    step: 'waiting', // waiting, password_input, password_set, card_scan, add_card
    targetUserId: null,
    userData: null,
    password: null,
    uid: null,
    startTime: null
  };

  try {
    if (req.method === 'GET') {
      // ESP32 kiểm tra trạng thái
      console.log('📥 ESP32 checking registration state:', registrationState);
      return res.json(registrationState);
    }

    if (req.method === 'POST') {
      const { action } = req.body;
      console.log('📨 Admin API action:', action, req.body);

      switch (action) {
        // =================== USER REGISTRATION ===================
        case 'start_registration':
          return await startRegistration(req, res, pool);
        
        case 'set_password':
          return await setPassword(req, res, pool);
        
        case 'scan_uid':
          return await scanUID(req, res, pool);
        
        case 'complete_without_uid':
          return await completeWithoutUID(req, res, pool);
        
        // =================== CARD MANAGEMENT ===================
        case 'start_add_card':
          return await startAddCard(req, res, pool);
        
        case 'cancel_add_card':
          return cancelAddCard(req, res, pool);
        
        // =================== GENERAL ===================
        case 'cancel_registration':
          return cancelRegistration(req, res, pool);
        
        case 'get_status':
          return res.json(registrationState);

        default:
          return res.status(400).json({ error: 'Invalid action: ' + action });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Admin API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    await pool.end();
  }
}

// =================== REGISTRATION FUNCTIONS ===================

async function startRegistration(req, res, pool) {
  console.log('🚀 Starting new user registration');
  
  registrationState = {
    isActive: true,
    step: 'password_input',
    targetUserId: null,
    userData: req.body.userData || null,
    password: null,
    uid: null,
    startTime: Date.now()
  };
  
  console.log('✅ Registration state updated:', registrationState);
  
  return res.json({ 
    success: true, 
    message: 'Registration started - ESP32 should enter password input mode',
    state: registrationState
  });
}

async function setPassword(req, res, pool) {
  const { password } = req.body;
  
  if (!password || password.length !== 4) {
    return res.status(400).json({ error: 'Password must be 4 digits' });
  }

  console.log('🔐 Setting password for registration:', password);
  
  registrationState.password = password;
  registrationState.step = 'password_set';
  
  console.log('✅ Registration state updated:', registrationState);
  
  return res.json({ 
    success: true, 
    message: 'Password set, waiting for card scan or timeout',
    state: registrationState
  });
}

async function scanUID(req, res, pool) {
  const { uid } = req.body;
  
  if (!uid) {
    return res.status(400).json({ error: 'UID is required' });
  }

  console.log('📡 UID scanned for registration:', uid);
  
  // Check if UID already exists
  const existingUser = await pool.query(
    'SELECT "Full_Name" FROM "Manager_Sign_In" WHERE "UID" = $1',
    [uid]
  );

  if (existingUser.rows.length > 0) {
    return res.status(400).json({ 
      error: 'Card already assigned to: ' + existingUser.rows[0].Full_Name 
    });
  }
  
  registrationState.uid = uid;
  
  // Complete registration
  return await completeRegistration(res, pool);
}

async function completeWithoutUID(req, res, pool) {
  console.log('📝 Completing registration without UID');
  
  registrationState.uid = null;
  
  return await completeRegistration(res, pool);
}

async function completeRegistration(res, pool) {
  if (!registrationState.password) {
    return res.status(400).json({ error: 'Password not set' });
  }

  let client;
  try {
    client = await pool.connect();
    
    // Generate user ID
    const userIdResult = await client.query('SELECT COALESCE(MAX(id_user), 0) + 1 as next_id FROM "Manager_Sign_In"');
    const newUserId = userIdResult.rows[0].next_id;
    
    // Generate name - use provided name or auto-generate
    const userName = registrationState.userData?.fullName || `User${String(newUserId).padStart(3, '0')}`;
    
    // ✅ SỬA: Không dùng created_at vì không có trong cấu trúc gốc
    const insertResult = await client.query(
      `INSERT INTO "Manager_Sign_In" (id_user, "Full_Name", private_pwd, "UID") 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [newUserId, userName, registrationState.password, registrationState.uid]
    );

    console.log('✅ Registration completed for:', userName);
    
    // Reset state
    registrationState = {
      isActive: false,
      step: 'waiting',
      targetUserId: null,
      userData: null,
      password: null,
      uid: null,
      startTime: null
    };
    
    client.release();
    
    return res.json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: insertResult.rows[0].id_user,
        name: insertResult.rows[0].Full_Name,
        uid: insertResult.rows[0].UID
      }
    });
  } catch (error) {
    console.error('❌ Complete registration error:', error);
    if (client) client.release();
    return res.status(500).json({ 
      error: 'Failed to complete registration', 
      detail: error.message 
    });
  }
}

// =================== CARD MANAGEMENT ===================

async function startAddCard(req, res, pool) {
  const { targetUserId } = req.body;
  
  if (!targetUserId) {
    return res.status(400).json({ error: 'Target user ID is required' });
  }

  // Verify user exists
  const userCheck = await pool.query(
    'SELECT * FROM "Manager_Sign_In" WHERE id_user = $1',
    [targetUserId]
  );

  if (userCheck.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = userCheck.rows[0];

  if (user.UID && user.UID.trim() !== '') {
    return res.status(400).json({ error: 'User already has a card' });
  }

  console.log('🆔 Starting add card for:', user.Full_Name);

  registrationState = {
    isActive: true,
    step: 'add_card',
    targetUserId: targetUserId,
    userData: user,
    password: null,
    uid: null,
    startTime: Date.now()
  };
  
  console.log('✅ Add card state set:', registrationState);
  
  return res.json({ 
    success: true, 
    message: 'Add Card mode activated - ESP32 should enter scan mode',
    targetUser: user.Full_Name,
    state: registrationState
  });
}

async function cancelAddCard(req, res, pool) {
  console.log('❌ Add Card mode cancelled');
  
  registrationState = {
    isActive: false,
    step: 'waiting',
    targetUserId: null,
    userData: null,
    password: null,
    uid: null,
    startTime: null
  };
  
  return res.json({ 
    success: true, 
    message: 'Add Card mode cancelled',
    state: registrationState
  });
}

// =================== GENERAL ===================

async function cancelRegistration(req, res, pool) {
  console.log('❌ Registration cancelled');
  
  registrationState = {
    isActive: false,
    step: 'waiting',
    targetUserId: null,
    userData: null,
    password: null,
    uid: null,
    startTime: null
  };
  
  return res.json({ 
    success: true, 
    message: 'Registration cancelled',
    state: registrationState
  });
}