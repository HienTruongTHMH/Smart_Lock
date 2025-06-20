export function setupCors(req, res) {
  // ✅ Allow both web interface and ESP32 (no origin)
  const allowedOrigins = [
    'https://api-iot-v2-4efa4bqzs-hiens-projects-d1689d2e.vercel.app'
  ];
  
  const origin = req.headers.origin;
  
  // ESP32 requests don't have origin header, so allow them
  if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'null');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  
  return false;
}

export function handleOptions(req, res) {
  console.log('🔄 Handling OPTIONS preflight request');
  console.log('🔄 Origin:', req.headers.origin);
  console.log('🔄 Method:', req.headers['access-control-request-method']);
  console.log('🔄 Headers:', req.headers['access-control-request-headers']);
  
  setupCors(req, res);
  
  return res.status(200).end();
}

export function handleError(error, req, res) {
  console.error('❌ API Error:', error);
  console.error('❌ Stack:', error.stack);
  
  // Ensure CORS headers are set even for errors
  try {
    setupCors(req, res);
  } catch (corsError) {
    console.error('❌ CORS Error:', corsError);
    // Fallback CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
}