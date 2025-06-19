export default function handler(req, res) {
  console.log('🔧 Serverless function test');
  console.log('Node version:', process.version);
  console.log('Environment:', process.env.NODE_ENV);
  
  // Check environment variables
  console.log('POSTGRES_URL exists:', !!process.env.POSTGRES_URL);
  
  // Check imports
  try {
    import('pg').then(() => {
      console.log('✅ pg module imported successfully');
    }).catch(err => {
      console.error('❌ pg import error:', err);
    });
  } catch (error) {
    console.error('❌ Dynamic import error:', error);
  }
  
  res.status(200).json({
    status: 'ok',
    message: 'Serverless function running',
    nodeVersion: process.version,
    env: process.env.NODE_ENV,
    hasPostgresUrl: !!process.env.POSTGRES_URL,
    timestamp: new Date().toISOString()
  });
}