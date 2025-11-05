import { Router } from 'express'
import { getMenu, updateMenu } from '../../controllers/creators/creator.controller.js'
import { auth } from '../../middleware/auth.js'

const router = Router()

router.get('/:id/menu', getMenu)
router.patch('/:id/menu', auth, updateMenu)

export default router
