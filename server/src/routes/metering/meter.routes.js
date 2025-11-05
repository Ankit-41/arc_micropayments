import { Router } from 'express'
import { finalizeRead, recordReadEvent } from '../../controllers/metering/meter.controller.js'

const router = Router()

router.post('/events/read', recordReadEvent)
router.post('/finalize_read', finalizeRead)

export default router
