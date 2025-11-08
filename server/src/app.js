import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import morgan from 'morgan'
import routes from './routes/index.js'
import mongoose from 'mongoose'
const PORT = process.env.PORT || 4000

const app = express()

app.use(cors({ origin: process.env.ORIGIN?.split(',') || '*', credentials: true }))
// Increase body size limit to handle audio files (10MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'))

app.get('/', (_req, res) => res.json({ ok: true, service: 'server' }))
app.use(routes)

mongoose.connect(process.env.MONGO_URI).then(() => {
  app.listen(PORT, () => console.log('Server on', PORT))
}).catch(err => {
  console.error(err)
  process.exit(1)
})

export default app
