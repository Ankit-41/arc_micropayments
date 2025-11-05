import { Router } from 'express'
import { connectWallet, getWalletSummary, recordApproval, recordDeposit, processWallet } from '../../controllers/wallet/wallet.controller.js'
import { auth } from '../../middleware/auth.js'

const router = Router()

router.get('/wallet/summary', auth, getWalletSummary)
router.post('/wallet/connect', auth, connectWallet)
router.post('/wallet/approve', auth, recordApproval)
router.post('/wallet/deposit', auth, recordDeposit)
router.post('/wallet/process', auth, processWallet)

export default router
