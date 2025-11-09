import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import morgan from 'morgan'
import routes from './src/routes/index.js' // adjust if your routes live elsewhere

const app = express()

app.use(cors({ origin: process.env.ORIGIN?.split(',') || '*', credentials: true }))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))
app.use(morgan('dev'))

app.get('/', (_req, res) => res.json({ ok: true, service: 'server' }))
app.use(routes)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

export default app
