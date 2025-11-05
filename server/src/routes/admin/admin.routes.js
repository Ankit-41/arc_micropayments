import { Router } from 'express'
import { getAdminOverview } from '../../controllers/admin/admin.controller.js'
import { auth } from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/roles.js'

const router = Router()

router.get('/admin/overview', auth, requireAdmin, getAdminOverview)

export default router
