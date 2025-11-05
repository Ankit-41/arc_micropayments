import mongoose from 'mongoose'
import app from './app.js'

const PORT = process.env.PORT || 4000

mongoose.connect(process.env.MONGO_URI).then(() => {
  app.listen(PORT, () => console.log('Server on', PORT))
}).catch(err => {
  console.error(err)
  process.exit(1)
})
