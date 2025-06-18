export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Import từ set-registration-mode.js (hoặc dùng database/cache)
  const registrationMode = false; // Cần implement logic lưu trạng thái

  res.json({ 
    registrationMode,
    timestamp: new Date().toISOString()
  });
}