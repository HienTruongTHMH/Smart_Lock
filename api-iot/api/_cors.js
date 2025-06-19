export function setupCors(res) {
  // ✅ SỬA: Chỉ set một lần, cho phép tất cả origins
  res.setHeader('Access-Control-Allow-Origin', 'https://smart-lock-by-git.vercel.app');
  // ✅ HOẶC nếu muốn specific domain:
  // res.setHeader('Access-Control-Allow-Origin', 'https://smart-lock-by-git.vercel.app');
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // ✅ SỬA: Thêm Vary header để browser cache đúng
  res.setHeader('Vary', 'Origin');
  
  return false;
}

export function handleOptions(req, res) {
  console.log('🔄 Handling OPTIONS preflight request');
  console.log('🔄 Origin:', req.headers.origin);
  console.log('🔄 Method:', req.headers['access-control-request-method']);
  console.log('🔄 Headers:', req.headers['access-control-request-headers']);
  
  setupCors(res);
  
  return res.status(200).end();
}

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