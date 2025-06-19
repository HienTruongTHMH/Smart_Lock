import { Pool } from 'pg';
import { setupCors } from './_cors.js';

// ✅ Định nghĩa state mặc định
const defaultState = {
  isActive: false,
  step: 'waiting',
  targetUserId: null,
  userData: null,
  password: null,
  uid: null,
  startTime: null,
  message: null // Thêm message để hiển thị trên ESP32
};

// ✅ Sử dụng biến global (chỉ trong phiên hiện tại)
let registrationState = { ...defaultState };

export default async function handler(req, res) {
  setupCors(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({ error: 'Database connection not configured' });
  }

  console.log('📝 Admin API Request:', req.method, req.body?.action || 'GET state');

  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  let client;

  try {
    client = await pool.connect();
    
    // ✅ Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS "System_State" (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // ✅ SỬA: Load state với error handling tốt hơn
    let registrationState = { ...defaultState };
    
    try {
      const stateResult = await client.query(
        'SELECT value FROM "System_State" WHERE key = $1',
        ['registration_state']
      );
      
      if (stateResult.rows.length > 0) {
        const loadedState = stateResult.rows[0].value;
        
        // ✅ VALIDATE state structure
        if (loadedState && typeof loadedState === 'object') {
          registrationState = {
            isActive: loadedState.isActive || false,
            step: loadedState.step || 'waiting',
            targetUserId: loadedState.targetUserId || null,
            userData: loadedState.userData || null,
            password: loadedState.password || null,
            uid: loadedState.uid || null,
            startTime: loadedState.startTime || null,
            message: loadedState.message || null
          };
          console.log('✅ Loaded and validated state from database:', registrationState);
        } else {
          console.log('⚠️ Invalid state structure, using default');
          registrationState = { ...defaultState };
        }
      } else {
        console.log('ℹ️ No state found, initializing default');
        registrationState = { ...defaultState };
      }
      
      // ✅ ALWAYS ensure state exists in database
      await client.query(
        'INSERT INTO "System_State" (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP',
        ['registration_state', JSON.stringify(registrationState)]
      );
      
    } catch (stateError) {
      console.error('❌ Error loading state, using default:', stateError);
      registrationState = { ...defaultState };
      
      // Force insert default state
      await client.query(
        'INSERT INTO "System_State" (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP',
        ['registration_state', JSON.stringify(registrationState)]
      );
    }
    
    // Process the request
    if (req.method === 'GET') {
      console.log('📥 ESP32 checking registration state:', registrationState);
      return res.json(registrationState);
    }

    if (req.method === 'POST') {
      const { action } = req.body;
      
      // ✅ PASS registrationState as parameter
      switch (action) {
        case 'start_registration':
          return await startRegistration(req, res, client, registrationState);
        
        case 'cancel_registration':
          return await cancelRegistration(req, res, client, registrationState);
        
        case 'start_add_card':
          return await startAddCard(req, res, client, registrationState);
        
        case 'cancel_add_card':
          return await cancelAddCard(req, res, client, registrationState);
          
        case 'submit_password':
          return await setPassword(req, res, client, registrationState);
          
        case 'submit_card':
          return await scanUID(req, res, client, registrationState);
          
        case 'complete_without_card':
          return await completeWithoutUID(req, res, client, registrationState);
        
        case 'reset_state':
          return await resetState(req, res, client, registrationState);
        
        default:
          return res.status(400).json({ error: 'Invalid action' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('❌ Admin API Error:', error);
    console.error('❌ Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Internal server error',
      detail: process.env.NODE_ENV === 'development' ? error.message : 'Server error',
      action: req.body?.action || 'unknown'
    });
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// =================== REGISTRATION FUNCTIONS ===================

async function startRegistration(req, res, client, currentState) {
  console.log('🚀 Starting new user registration');
  
  const newState = {
    isActive: true,
    step: 'password_input',
    targetUserId: null,
    userData: req.body.userData || null,
    password: null,
    uid: null,
    startTime: Date.now(),
    message: 'Vui lòng nhập mật khẩu 4 chữ số'
  };
  
  await client.query(
    'UPDATE "System_State" SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
    [JSON.stringify(newState), 'registration_state']
  );
  
  console.log('✅ Registration state updated:', newState);
  
  return res.json({ 
    success: true, 
    message: 'Registration started - ESP32 should enter password input mode',
    state: newState
  });
}

async function setPassword(req, res, client, currentState) {
  const { password } = req.body;
  
  if (!password || password.length !== 4) {
    return res.status(400).json({ error: 'Password must be 4 digits' });
  }

  console.log('🔐 Setting password for registration:', password);
  
  // Check if password already exists
  const existingPwd = await client.query(
    'SELECT id_user FROM "Manager_Sign_In" WHERE private_pwd = $1',
    [password]
  );
  
  if (existingPwd.rows.length > 0) {
    const errorState = {
      ...currentState,
      message: 'Mật khẩu đã tồn tại, vui lòng thử mật khẩu khác'
    };
    
    await client.query(
      'UPDATE "System_State" SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
      [JSON.stringify(errorState), 'registration_state']
    );
    
    return res.json({ 
      success: false, 
      error: 'Password already exists',
      message: 'Mật khẩu đã tồn tại, vui lòng thử mật khẩu khác'
    });
  }
  
  const newState = {
    ...currentState,
    password: password,
    step: 'password_set',
    message: 'Mật khẩu đã được nhận. Quét thẻ RFID hoặc nhấn # để bỏ qua'
  };
  
  await client.query(
    'UPDATE "System_State" SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
    [JSON.stringify(newState), 'registration_state']
  );
  
  console.log('✅ Registration state updated:', newState);
  
  return res.json({ 
    success: true, 
    message: 'Password set, waiting for card scan or timeout',
    state: newState
  });
}

async function scanUID(req, res, client, currentState) {
  const { uid } = req.body;
  
  if (!uid) {
    return res.status(400).json({ error: 'UID is required' });
  }

  console.log('📡 UID scanned for registration:', uid);
  
  // ✅ Load current state from database
  const stateResult = await client.query(
    'SELECT value FROM "System_State" WHERE key = $1',
    ['registration_state']
  );
  
  if (stateResult.rows.length === 0) {
    return res.status(400).json({ 
      success: false,
      error: 'No active registration' 
    });
  }
  
  let currentState = stateResult.rows[0].value;
  
  if (!currentState.isActive || currentState.step !== 'password_set') {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid state for card scan',
      currentState: currentState
    });
  }
  
  // ✅ Check if UID already exists
  const existingUser = await client.query(
    'SELECT "Full_Name" FROM "Manager_Sign_In" WHERE "UID" = $1',
    [uid]
  );

  if (existingUser.rows.length > 0) {
    return res.status(400).json({ 
      success: false,
      error: 'Card already assigned to: ' + existingUser.rows[0].Full_Name 
    });
  }
  
  // ✅ Complete registration with card
  await client.query('BEGIN');
  
  try {
    // Generate user ID
    const userIdResult = await client.query(
      'SELECT COALESCE(MAX(id_user), 0) + 1 as next_id FROM "Manager_Sign_In"'
    );
    const newUserId = userIdResult.rows[0].next_id;
    
    // Generate name
    const userName = currentState.userData?.fullName || `User${String(newUserId).padStart(3, '0')}`;
    
    // Insert new user with card
    const insertResult = await client.query(
      `INSERT INTO "Manager_Sign_In" (id_user, "Full_Name", private_pwd, "UID") 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [newUserId, userName, currentState.password, uid]
    );
    
    // Reset state
    const resetState = {
      isActive: false,
      step: 'waiting',
      targetUserId: null,
      userData: null,
      password: null,
      uid: null,
      startTime: null,
      message: 'Đăng ký thành công với thẻ'
    };
    
    await client.query(
      'UPDATE "System_State" SET value = $1 WHERE key = $2',
      [JSON.stringify(resetState), 'registration_state']
    );
    
    await client.query('COMMIT');
    
    console.log('✅ Registration completed with card for:', userName);
    
    return res.json({
      success: true,
      message: 'Registration completed with card',
      user: {
        id: insertResult.rows[0].id_user,
        name: insertResult.rows[0].Full_Name,
        uid: insertResult.rows[0].UID
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Complete registration with card error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to complete registration', 
      detail: error.message 
    });
  }
}

async function completeWithoutUID(req, res, client, currentState) {
  console.log('📝 Completing registration without UID');
  console.log('📊 Current state passed:', currentState);
  
  if (!currentState.isActive || currentState.step !== 'password_set') {
    console.log('❌ Invalid state for completion:', currentState);
    return res.status(400).json({ 
      success: false,
      error: `Invalid state for completion. Current step: ${currentState.step}, active: ${currentState.isActive}`,
      currentState: currentState
    });
  }
  
  if (!currentState.password) {
    console.log('❌ No password set in current state');
    return res.status(400).json({ 
      success: false,
      error: 'Password not set in current state',
      currentState: currentState
    });
  }

  console.log('✅ State validation passed, proceeding with registration');
  console.log('🔐 Using password:', currentState.password);
  console.log('👤 Using userData:', currentState.userData);

  await client.query('BEGIN');
  
  try {
    // Generate user ID
    const userIdResult = await client.query(
      'SELECT COALESCE(MAX(id_user), 0) + 1 as next_id FROM "Manager_Sign_In"'
    );
    const newUserId = userIdResult.rows[0].next_id;
    console.log('🆔 Generated new user ID:', newUserId);
    
    // Generate name - use provided name or auto-generate
    const userName = currentState.userData?.fullName || `User${String(newUserId).padStart(3, '0')}`;
    console.log('👤 Generated user name:', userName);
    
    // Insert new user without card
    const insertResult = await client.query(
      `INSERT INTO "Manager_Sign_In" (id_user, "Full_Name", private_pwd) 
       VALUES ($1, $2, $3) RETURNING *`,
      [newUserId, userName, currentState.password]
    );
    
    console.log('✅ User inserted successfully:', insertResult.rows[0]);
    
    // Reset state
    const resetState = {
      isActive: false,
      step: 'waiting',
      targetUserId: null,
      userData: null,
      password: null,
      uid: null,
      startTime: null,
      message: 'Đăng ký thành công không có thẻ'
    };
    
    await client.query(
      'UPDATE "System_State" SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
      [JSON.stringify(resetState), 'registration_state']
    );
    
    console.log('✅ State reset successfully');
    
    await client.query('COMMIT');
    
    console.log('✅ Registration completed without card for:', userName);
    
    return res.json({
      success: true,
      message: 'Registration completed without card',
      user: {
        id: insertResult.rows[0].id_user,
        name: insertResult.rows[0].Full_Name
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Complete registration error:', error);
    console.error('❌ Error stack:', error.stack);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to complete registration', 
      detail: error.message,
      currentState: currentState
    });
  }
}

// ✅ THÊM: Reset state function
async function resetState(req, res, client, currentState) {
  console.log('🔄 Resetting registration state to default');
  
  const resetState = {
    isActive: false,
    step: 'waiting',
    targetUserId: null,
    userData: null,
    password: null,
    uid: null,
    startTime: null,
    message: 'State đã được reset'
  };
  
  await client.query(
    'UPDATE "System_State" SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
    [JSON.stringify(resetState), 'registration_state']
  );
  
  return res.json({ 
    success: true, 
    message: 'State reset successfully',
    state: resetState
  });
}

// =================== CARD MANAGEMENT ===================

async function startAddCard(req, res, client) {
  const { targetUserId } = req.body;
  
  if (!targetUserId) {
    return res.status(400).json({ error: 'Target user ID is required' });
  }

  // Verify user exists
  const userCheck = await client.query(
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
    startTime: Date.now(),
    message: 'Quét thẻ RFID để gán cho ' + user.Full_Name
  };
  
  // ✅ THÊM: Lưu state vào database
  await client.query(
    'UPDATE "System_State" SET value = $1 WHERE key = $2',
    [JSON.stringify(registrationState), 'registration_state']
  );
  
  console.log('✅ Add card state set:', registrationState);
  
  return res.json({ 
    success: true, 
    message: 'Add Card mode activated - ESP32 should enter scan mode',
    targetUser: user.Full_Name,
    state: registrationState
  });
}

async function cancelAddCard(req, res, client) {
  console.log('❌ Add Card mode cancelled');
  
  registrationState = {
    isActive: false,
    step: 'waiting',
    targetUserId: null,
    userData: null,
    password: null,
    uid: null,
    startTime: null,
    message: 'Thêm thẻ đã bị hủy'
  };
  
  // ✅ THÊM: Lưu state vào database
  await client.query(
    'UPDATE "System_State" SET value = $1 WHERE key = $2',
    [JSON.stringify(registrationState), 'registration_state']
  );
  
  return res.json({ 
    success: true, 
    message: 'Add Card mode cancelled',
    state: registrationState
  });
}

// =================== GENERAL ===================

async function cancelRegistration(req, res, client) {
  console.log('❌ Registration cancelled');
  
  registrationState = {
    isActive: false,
    step: 'waiting',
    targetUserId: null,
    userData: null,
    password: null,
    uid: null,
    startTime: null,
    message: 'Đăng ký đã bị hủy'
  };
  
  // ✅ THÊM: Lưu state vào database
  await client.query(
    'UPDATE "System_State" SET value = $1 WHERE key = $2',
    [JSON.stringify(registrationState), 'registration_state']
  );
  
  return res.json({ 
    success: true, 
    message: 'Registration cancelled',
    state: registrationState
  });
}