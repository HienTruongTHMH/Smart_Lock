export function setupCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // Hoặc 'https://smart-lock-by-git.vercel.app'
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setupCors(res);
    return res.status(200).end();
  }
}