import { Router } from 'express'
import { confirmTip, getTipHistory, processTip } from '../../controllers/tips/tip.controller.js'
import { auth } from '../../middleware/auth.js'

const router = Router()

router.post('/tip/process', auth, processTip)
router.post('/tip/confirm', auth, confirmTip)
router.get('/tip/history', auth, getTipHistory)

export default router

