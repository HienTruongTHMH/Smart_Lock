export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Smart Lock API Dashboard</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 min-h-screen">
        <div class="container mx-auto p-6">
            <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
                <h1 class="text-3xl font-bold text-gray-800">
                    🔐 Smart Lock API Dashboard
                </h1>
                <p class="text-gray-600 mt-2">IoT Smart Lock Management System</p>
                <p class="text-sm text-gray-500 mt-2">Server Time: ${new Date().toLocaleString('vi-VN')}</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold mb-4">📡 API Endpoints</h3>
                    <div class="space-y-2 text-sm">
                        <div>✅ GET /api/test-db</div>
                        <div>✅ POST /api/check-password</div>
                        <div>✅ POST /api/check-uid</div>
                        <div>✅ POST /api/log-access</div>
                        <div>✅ POST /api/register-card</div>
                        <div>✅ GET /api/get-cards</div>
                    </div>
                </div>

                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold mb-4">🔧 Quick Actions</h3>
                    <div class="space-y-3">
                        <a href="/api/test-db" target="_blank" 
                           class="block w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 text-center">
                            Test Database
                        </a>
                        <a href="/api/setup-database" target="_blank"
                           class="block w-full bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 text-center">
                            Setup Database
                        </a>
                        <a href="/api/get-cards" target="_blank"
                           class="block w-full bg-purple-500 text-white py-2 px-4 rounded hover:bg-purple-600 text-center">
                            Get Cards
                        </a>
                    </div>
                </div>

                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold mb-4">📊 Status</h3>
                    <div class="space-y-2">
                        <div class="flex justify-between">
                            <span>Environment:</span>
                            <span class="font-mono">${process.env.NODE_ENV || 'production'}</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Database:</span>
                            <span class="text-green-600">✅ Connected</span>
                        </div>
                        <div class="flex justify-between">
                            <span>Status:</span>
                            <span class="text-green-600">🟢 Online</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-lg p-6">
                <h2 class="text-2xl font-bold mb-4">📋 API Documentation</h2>
                <div class="space-y-4">
                    <div class="border-l-4 border-blue-500 pl-4">
                        <h4 class="font-semibold">For Arduino/ESP32:</h4>
                        <p class="text-sm text-gray-600">Use these endpoints for IoT device communication</p>
                        <code class="text-xs bg-gray-100 p-1 rounded">
                            const char* api_base_url = "${req.headers.host ? 'https://' + req.headers.host : 'https://your-vercel-url.vercel.app'}";
                        </code>
                    </div>
                    
                    <div class="border-l-4 border-green-500 pl-4">
                        <h4 class="font-semibold">For Web Interface:</h4>
                        <p class="text-sm text-gray-600">Access the management panel</p>
                        <a href="/public/index.html" class="text-blue-500 hover:underline text-sm">
                            → Open Management Panel
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
  `);
}