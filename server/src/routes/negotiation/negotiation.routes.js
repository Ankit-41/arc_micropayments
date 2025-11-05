import { Router } from 'express'
import {
  createReservation,
  getCreatorMenu,
  getUserBudget,
  meterPreview,
  getNegotiationContext,
  recordNegotiationStep,
  startNegotiation,
} from '../../controllers/negotiation/negotiation.controller.js'

const router = Router()

router.get('/get_creator_menu', getCreatorMenu)
router.get('/get_user_budget', getUserBudget)
router.post('/meter_preview', meterPreview)
router.get('/negotiate/context', getNegotiationContext)
router.post('/record_negotiation_step', recordNegotiationStep)
router.post('/create_reservation', createReservation)
router.post('/negotiate/start', startNegotiation)

export default router
