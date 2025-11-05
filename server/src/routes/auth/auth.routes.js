import { Router } from 'express'
import { ensureAdmin, me, signin, signout, signup } from '../../controllers/auth/auth.controller.js'

const router = Router()

router.post('/signup', signup)
router.post('/signin', signin)
router.post('/ensure-admin', ensureAdmin)
router.get('/me', me)
router.post('/signout', signout)

export default router
