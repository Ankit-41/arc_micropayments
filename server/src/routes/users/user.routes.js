import { Router } from 'express'
import { getUsageSummary, updateUser } from '../../controllers/users/user.controller.js'
import { auth } from '../../middleware/auth.js'

const router = Router()

router.patch('/:id', auth, updateUser)
router.get('/:id/usage', auth, getUsageSummary)

export default router
