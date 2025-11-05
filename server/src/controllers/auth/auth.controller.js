import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { Creator, User } from '../../models/index.js'

function sanitizeUser(user){
  return {
    id: user._id,
    email: user.email,
    role: user.role,
    wallet: user.wallet,
    approvedTotal: user.approvedTotal,
    usedTotal: user.usedTotal,
    depositedTotal: user.depositedTotal,
    pendingHold: user.pendingHold,
  }
}

function createToken(user){
  return jwt.sign(
    {
      _id: user._id,
      id: user._id,
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  )
}

export async function signup(req, res){
  const { email, password } = req.body
  if(!email || !password){
    return res.status(400).json({ error: 'email and password required' })
  }
  const existing = await User.findOne({ email })
  if(existing){
    return res.status(409).json({ error: 'email already registered' })
  }
  const hash = await bcrypt.hash(password, 10)
  const user = await User.create({ email, passwordHash: hash })
  const token = createToken(user)
  res.json({ token, user: sanitizeUser(user) })
}

export async function signin(req, res){
  const { email, password } = req.body
  const user = await User.findOne({ email })
  if(!user) return res.status(401).json({ error: 'Invalid credentials' })
  const ok = await bcrypt.compare(password, user.passwordHash)
  if(!ok) return res.status(401).json({ error: 'Invalid credentials' })
  const token = createToken(user)
  res.json({ token, user: sanitizeUser(user) })
}

export async function me(req, res){
  const hdr = req.headers.authorization || ''
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null
  if(!token) return res.json({ user: null })
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(data.id)
    if(!user) return res.json({ user: null })
    res.json({ user: sanitizeUser(user) })
  } catch {
    res.json({ user: null })
  }
}

export function signout(_req, res){
  res.json({ ok: true })
}

export async function ensureAdmin(req, res){
  const { key, email, password } = req.body
  if(!process.env.ADMIN_SETUP_KEY || key !== process.env.ADMIN_SETUP_KEY){
    return res.status(403).json({ error: 'Invalid setup key' })
  }
  if(!email || !password){
    return res.status(400).json({ error: 'email and password required' })
  }
  let user = await User.findOne({ email })
  if(user){
    user.role = 'admin'
    if(password){
      user.passwordHash = await bcrypt.hash(password, 10)
    }
    await user.save()
  } else {
    const hash = await bcrypt.hash(password, 10)
    user = await User.create({ email, passwordHash: hash, role: 'admin' })
  }
  res.json({ user: sanitizeUser(user) })
}

export async function ensureCreatorProfile(userId, walletAddress = ''){
  let creator = await Creator.findOne({ userId })
  if(!creator){
    creator = await Creator.create({
      userId,
      wallet: walletAddress || '',
      trustScore: 0.7,
      reputation: 0.7,
      menu: { perMinFloor: 0.2, perReadFloor: 0.6 },
    })
  }
  return creator
}
