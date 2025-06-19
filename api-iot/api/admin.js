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
    // ✅ Get registration state from database
    client = await pool.connect();
    
    // ✅ Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS "System_State" (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // ✅ Load state from database
    const stateResult = await client.query(
      'SELECT value FROM "System_State" WHERE key = $1',
      ['registration_state']
    );
    
    if (stateResult.rows.length > 0) {
      // State exists in database
      registrationState = stateResult.rows[0].value;
      console.log('✅ Loaded state from database:', registrationState);
    } else {
      // Initialize state in database
      await client.query(
        'INSERT INTO "System_State" (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        ['registration_state', JSON.stringify(registrationState)]
      );
      console.log('✅ Initialized default state in database');
    }
    
    // Process the request
    if (req.method === 'GET') {
      // ESP32 kiểm tra trạng thái
      console.log('📥 ESP32 checking registration state:', registrationState);
      return res.json(registrationState);
    }

    if (req.method === 'POST') {
      const { action } = req.body;
      
      switch (action) {
        case 'start_registration':
          return await startRegistration(req, res, client);
        
        case 'cancel_registration':
          return await cancelRegistration(req, res, client);
        
        case 'start_add_card':
          return await startAddCard(req, res, client);
        
        case 'cancel_add_card':
          return await cancelAddCard(req, res, client);
          
        // ✅ THÊM: Xử lý các actions từ ESP32
        case 'submit_password':
          return await setPassword(req, res, client);
          
        case 'submit_card':
          return await scanUID(req, res, client);
          
        case 'complete_without_card':
          return await completeWithoutUID(req, res, client);
        
        // ✅ THÊM: Reset state API
        case 'reset_state':
          return await resetState(req, res, client);
        
        default:
          return res.status(400).json({ error: 'Invalid action' });
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
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// =================== REGISTRATION FUNCTIONS ===================

async function startRegistration(req, res, client) {
  console.log('🚀 Starting new user registration');
  
  // ✅ SỬA: Update registrationState
  registrationState = {
    isActive: true,
    step: 'password_input',
    targetUserId: null,
    userData: req.body.userData || null,
    password: null,
    uid: null,
    startTime: Date.now(),
    message: 'Vui lòng nhập mật khẩu 4 chữ số'
  };
  
  // ✅ THÊM: Lưu state vào database
  await client.query(
    'UPDATE "System_State" SET value = $1 WHERE key = $2',
    [JSON.stringify(registrationState), 'registration_state']
  );
  
  console.log('✅ Registration state updated:', registrationState);
  
  return res.json({ 
    success: true, 
    message: 'Registration started - ESP32 should enter password input mode',
    state: registrationState
  });
}

async function setPassword(req, res, client) {
  const { password } = req.body;
  
  if (!password || password.length !== 4) {
    return res.status(400).json({ error: 'Password must be 4 digits' });
  }

  console.log('🔐 Setting password for registration:', password);
  
  // ✅ Kiểm tra password đã tồn tại
  const existingPwd = await client.query(
    'SELECT id_user FROM "Manager_Sign_In" WHERE private_pwd = $1',
    [password]
  );
  
  if (existingPwd.rows.length > 0) {
    // ✅ Password đã tồn tại - báo lỗi
    registrationState.message = 'Mật khẩu đã tồn tại, vui lòng thử mật khẩu khác';
    
    // ✅ THÊM: Lưu state vào database
    await client.query(
      'UPDATE "System_State" SET value = $1 WHERE key = $2',
      [JSON.stringify(registrationState), 'registration_state']
    );
    
    return res.json({ 
      success: false, 
      error: 'Password already exists',
      message: 'Mật khẩu đã tồn tại, vui lòng thử mật khẩu khác'
    });
  }
  
  registrationState.password = password;
  registrationState.step = 'password_set';
  registrationState.message = 'Mật khẩu đã được nhận. Quét thẻ RFID hoặc nhấn # để bỏ qua';
  
  // ✅ THÊM: Lưu state vào database
  await client.query(
    'UPDATE "System_State" SET value = $1 WHERE key = $2',
    [JSON.stringify(registrationState), 'registration_state']
  );
  
  console.log('✅ Registration state updated:', registrationState);
  
  return res.json({ 
    success: true, 
    message: 'Password set, waiting for card scan or timeout',
    state: registrationState
  });
}

async function scanUID(req, res, client) {
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

async function completeWithoutUID(req, res, client) {
  console.log('📝 Completing registration without UID');
  
  // ✅ Load current state from database
  const stateResult = await client.query(
    'SELECT value FROM "System_State" WHERE key = $1',
    ['registration_state']
  );
  
  if (stateResult.rows.length === 0) {
    return res.status(400).json({ 
      success: false,
      error: 'No registration state found' 
    });
  }
  
  let currentState = stateResult.rows[0].value;
  
  if (!currentState.isActive || currentState.step !== 'password_set') {
    return res.status(400).json({ 
      success: false,
      error: 'Invalid state for completion. Current step: ' + currentState.step,
      currentState: currentState
    });
  }
  
  if (!currentState.password) {
    return res.status(400).json({ 
      success: false,
      error: 'Password not set' 
    });
  }

  await client.query('BEGIN');
  
  try {
    // Generate user ID
    const userIdResult = await client.query(
      'SELECT COALESCE(MAX(id_user), 0) + 1 as next_id FROM "Manager_Sign_In"'
    );
    const newUserId = userIdResult.rows[0].next_id;
    
    // Generate name - use provided name or auto-generate
    const userName = currentState.userData?.fullName || `User${String(newUserId).padStart(3, '0')}`;
    
    // Insert new user without card
    const insertResult = await client.query(
      `INSERT INTO "Manager_Sign_In" (id_user, "Full_Name", private_pwd) 
       VALUES ($1, $2, $3) RETURNING *`,
      [newUserId, userName, currentState.password]
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
      message: 'Đăng ký thành công không có thẻ'
    };
    
    await client.query(
      'UPDATE "System_State" SET value = $1 WHERE key = $2',
      [JSON.stringify(resetState), 'registration_state']
    );
    
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
    return res.status(500).json({ 
      success: false,
      error: 'Failed to complete registration', 
      detail: error.message 
    });
  }
}

// ✅ THÊM: Reset state function
async function resetState(req, res, client) {
  console.log('🔄 Resetting registration state to default');
  
  const defaultState = {
    isActive: false,
    step: 'waiting',
    targetUserId: null,
    userData: null,
    password: null,
    uid: null,
    startTime: null,
    message: 'State đã được reset'
  };
  
  // Lưu state vào database
  await client.query(
    'UPDATE "System_State" SET value = $1 WHERE key = $2',
    [JSON.stringify(defaultState), 'registration_state']
  );
  
  return res.json({ 
    success: true, 
    message: 'State reset successfully',
    state: defaultState
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