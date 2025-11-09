import app from './app.js'
import { connectToDB } from './db.js'

// Vercel serverless function handler
export default async function handler(req, res) {
  try {
    await connectToDB()
    // Express app handles the request/response
    app(req, res)
  } catch (error) {
    console.error('Handler error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', message: error.message })
    }
  }
}

// Local development server - only start if not on Vercel
// Vercel sets VERCEL=1 environment variable
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 4000
  
  async function startServer() {
    try {
      await connectToDB()
      console.log('✓ Database connected')
      
      app.listen(PORT, () => {
        console.log(`✓ Server running on port ${PORT}`)
        console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`)
      })
    } catch (error) {
      console.error('✗ Failed to start server:', error)
      process.exit(1)
    }
  }
  
  startServer()
}
