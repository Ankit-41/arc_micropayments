import slugify from '../../util/slugify.js'
import { Post, User } from '../../models/index.js'
import { ensureCreatorProfile } from '../auth/auth.controller.js'

function buildPreview(content){
  if(!content) return ''
  const stripped = content.replace(/<[^>]+>/g, ' ')
  const words = stripped.trim().split(/\s+/)
  const previewWords = words.slice(0, 60)
  return previewWords.join(' ') + (words.length > 60 ? '…' : '')
}

export async function createPost(req, res){
  const { title, coverUrl, category, length, content, excerpt } = req.body
  if(!title || !content){
    return res.status(400).json({ error: 'Title and content are required' })
  }
  const userId = req.user.id
  const user = await User.findById(userId)
  if(!user){
    return res.status(401).json({ error: 'Invalid user' })
  }
  const creator = await ensureCreatorProfile(userId, user.wallet)
  const post = await Post.create({
    creatorId: creator._id,
    title,
    slug: slugify(title),
    coverUrl,
    category,
    length,
    content,
    excerpt,
    published: true,
  })
  res.json({ post })
}

export async function updatePost(req, res){
  const body = req.body
  const post = await Post.findByIdAndUpdate(req.params.id, { $set: body }, { new: true })
  res.json({ post })
}

export async function listPosts(req, res){
  const { category = '', page = '1' } = req.query
  const q = { published: true, ...(category ? { category } : {}) }
  const posts = await Post.find(q).sort({ createdAt: -1 }).skip((+page - 1) * 20).limit(20)
  const mapped = posts.map(p => ({
    ...p.toObject(),
    preview: p.excerpt || buildPreview(p.content || ''),
  }))
  res.json({ posts: mapped })
}

export async function getPost(req, res){
  const post = await Post.findOne({ slug: req.params.slug })
  if(!post) return res.status(404).json({ error: 'not found' })
  const preview = post.excerpt || buildPreview(post.content || '')
  res.json({ post: { ...post.toObject(), preview } })
}
