export function setupCors(res) {
  // Đảm bảo CORS headers luôn được set đúng
  res.setHeader('Access-Control-Allow-Origin', 'https://smart-lock-by-git.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Debug
  console.log('✅ CORS headers set for origin: https://smart-lock-by-git.vercel.app');
}

export function handleOptions(req, res) {
  setupCors(res);
  
  if (req.method === 'OPTIONS') {
    console.log('✅ Handling OPTIONS preflight request');
    res.status(200).end();
    return true;
  }
  
  return false;
}

// Hàm mới - gọi trong try-catch block
export function handleError(error, res) {
  console.error('❌ API Error:', error);
  console.error('Stack:', error.stack);
  
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
}