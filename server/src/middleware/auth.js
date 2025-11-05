import jwt from 'jsonwebtoken'

export function auth(req, res, next){
  const hdr = req.headers.authorization || ''
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null
  if(!token) return res.status(401).json({ error: 'Auth required' })
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET)
    req.user = data
    next()
  } catch (e){
    return res.status(401).json({ error: 'Invalid token' })
  }
}
