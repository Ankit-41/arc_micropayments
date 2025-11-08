import { Router } from 'express'
import authRoutes from './auth/auth.routes.js'
import creatorRoutes from './creators/creator.routes.js'
import meterRoutes from './metering/meter.routes.js'
import negotiationRoutes from './negotiation/negotiation.routes.js'
import postRoutes from './posts/post.routes.js'
import settlementRoutes from './settlement/settlement.routes.js'
import userRoutes from './users/user.routes.js'
import walletRoutes from './wallet/wallet.routes.js'
import adminRoutes from './admin/admin.routes.js'
import tipRoutes from './tips/tip.routes.js'
import orchestratorRoutes from './orchestrator/orchestrator.routes.js'

const router = Router()

router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/creators', creatorRoutes)
router.use('/posts', postRoutes)
router.use('/', walletRoutes)
router.use('/', adminRoutes)
router.use('/', negotiationRoutes)
router.use('/', meterRoutes)
router.use('/', settlementRoutes)
router.use('/', tipRoutes)
router.use('/', orchestratorRoutes)

export default router
