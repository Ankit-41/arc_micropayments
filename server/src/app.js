import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import morgan from 'morgan'
import routes from './routes/index.js'

const app = express()

app.use(cors({ origin: process.env.ORIGIN?.split(',') || '*', credentials: true }))
// Increase body size limit to handle audio files (10MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'))

app.get('/', (_req, res) => res.json({ ok: true, service: 'server' }))
app.use(routes)

export default app
