import { Router } from 'express'
import { createPost, getPost, listPosts, updatePost } from '../../controllers/posts/post.controller.js'
import { auth } from '../../middleware/auth.js'

const router = Router()

router.post('/', auth, createPost)
router.patch('/:id', auth, updatePost)
router.get('/', listPosts)
router.get('/:slug', getPost)

export default router
