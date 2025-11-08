import { Router } from 'express'
import { auth } from '../../middleware/auth.js'
import { processOrchestrator } from '../../controllers/orchestrator/orchestrator.controller.js'

const router = Router()

router.post('/orchestrator/process', auth, processOrchestrator)

export default router


