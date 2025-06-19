export function setupCors(res) {
  // ✅ SỬA: Cho phép tất cả origins hoặc specific domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  // ✅ Hoặc specific domain nếu muốn bảo mật hơn:
  // res.setHeader('Access-Control-Allow-Origin', 'https://smart-lock-by-git.vercel.app');
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // ✅ SỬA: Fix logic lỗi
  return false; // Always return false, không end response ở đây
}

export function handleOptions(req, res) {
  console.log('🔄 Handling OPTIONS preflight request');
  console.log('🔄 Origin:', req.headers.origin);
  console.log('🔄 Request headers:', req.headers['access-control-request-headers']);
  
  setupCors(res);
  
  if (req.method === 'OPTIONS') {
    console.log('✅ Sending OPTIONS response');
    res.status(200).end();
    return true;
  }
  
  return false;
}

// Hàm mới - gọi trong try-catch block
export function handleError(error, res) {
  console.error('❌ API Error:', error);
  console.error('❌ Stack:', error.stack);
  
  // Ensure CORS headers are set even for errors
  setupCors(res);
  
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
}