import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import { User, Creator, Post } from '../src/models/index.js'
import slugify from '../src/util/slugify.js'

await mongoose.connect(process.env.MONGO_URI)

await User.deleteMany({})
await Creator.deleteMany({})
await Post.deleteMany({})

const creatorPwd = await bcrypt.hash('password', 10)
const readerPwd = await bcrypt.hash('password', 10)

const creatorUser = await User.create({ email:'creator@example.com', passwordHash: creatorPwd, role:'user', dailyCap: 10, priceSensitivity: 0.4 })
const readerUser  = await User.create({ email:'reader@example.com',  passwordHash: readerPwd,  role:'user',  dailyCap: 5, priceSensitivity: 0.6 })

const creator = await Creator.create({
  userId: creatorUser._id,
  wallet: '0x0000000000000000000000000000000000000001',
  trustScore: 0.75,
  reputation: 0.8,
  menu: { perMinFloor: 0.2, perReadFloor: 0.8, suggestedPerMin: 0.3, suggestedPerRead: 1.2 }
})

await Post.create({
  creatorId: creator._id,
  title: 'How to Ship an Agentic Micropayments MVP in 7 Days',
  slug: slugify('How to Ship an Agentic Micropayments MVP in 7 Days'),
  category: 'ai',
  length: 'med',
  excerpt: 'A pragmatic guide to building per-minute/per-read pricing with one-shot agent negotiation.',
  content: '<p>Step 1: define your data model...</p>',
  published: true
})

console.log('Seeded users: creator@example.com / reader@example.com (password: password)')
await mongoose.disconnect()
process.exit(0)
