import { Router } from 'express'
import { aggregateSettlements, distributeSettlements } from '../../controllers/settlement/settlement.controller.js'
import { auth } from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/roles.js'

const router = Router()

router.post('/aggregate_settlements', auth, requireAdmin, aggregateSettlements)
router.post('/distribute_settlements', auth, requireAdmin, distributeSettlements)

export default router
