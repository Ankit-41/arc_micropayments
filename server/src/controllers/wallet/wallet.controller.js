import { Creator, Reservation, User, WalletApproval, WalletDeposit } from '../../models/index.js'

function toFixed6(value){
  return +Number(value || 0).toFixed(6)
}

function buildSummary(user, activeUsage = 0){
  const lifetimeUsed = toFixed6(user.usedTotal)
  const approvedTotal = toFixed6(user.approvedTotal)
  const active = toFixed6(activeUsage)
  const combinedUsed = toFixed6(lifetimeUsed + active)
  const percent = approvedTotal > 0 ? Math.min(1, combinedUsed / approvedTotal) : 0
  const availableAllowance = Math.max(0, toFixed6(user.approvedTotal - user.usedTotal - user.pendingHold))
  return {
    approvedTotal,
    lifetimeUsed,
    activeUsage: active,
    usedTotal: combinedUsed,
    depositedTotal: toFixed6(user.depositedTotal),
    pendingHold: toFixed6(user.pendingHold),
    percentUsed: percent,
    availableAllowance,
    wallet: user.wallet || '',
  }
}

export async function getWalletSummary(req, res){
  const user = await User.findById(req.user.id)
  if(!user) return res.status(404).json({ error: 'user not found' })
  const activeReservations = await Reservation.find({ userId: user._id, status: 'active' })
  const activeUsage = activeReservations.reduce((acc, r) => acc + (r.usedAmount || 0), 0)
  const summary = buildSummary(user, activeUsage)
  const approvals = await WalletApproval.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10)
  const deposits = await WalletDeposit.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10)
  res.json({ summary, approvals, deposits })
}

export async function connectWallet(req, res){
  const { address } = req.body
  if(!address) return res.status(400).json({ error: 'wallet address required' })
  const user = await User.findByIdAndUpdate(req.user.id, { $set: { wallet: address } }, { new: true })
  await Creator.findOneAndUpdate({ userId: user._id }, { $set: { wallet: address } })
  res.json({ wallet: user.wallet })
}

export async function recordApproval(req, res){
  const { amount, txHash, chainId } = req.body
  const value = Number(amount)
  if(!value || value <= 0) return res.status(400).json({ error: 'amount must be greater than zero' })
  const user = await User.findById(req.user.id)
  if(!user) return res.status(404).json({ error: 'user not found' })
  user.approvedTotal = toFixed6(user.approvedTotal + value)
  user.approvedAllowance = Math.max(0, toFixed6(user.approvedTotal - user.usedTotal - user.pendingHold))
  await user.save()
  const approval = await WalletApproval.create({ userId: user._id, amount: value, txHash, chainId })
  const activeReservations = await Reservation.find({ userId: user._id, status: 'active' })
  const activeUsage = activeReservations.reduce((acc, r) => acc + (r.usedAmount || 0), 0)
  res.json({ approval, summary: buildSummary(user, activeUsage) })
}

export async function recordDeposit(req, res){
  const { amount, txHash, chainId } = req.body
  const value = Number(amount)
  if(!value || value <= 0) return res.status(400).json({ error: 'amount must be greater than zero' })
  const user = await User.findById(req.user.id)
  if(!user) return res.status(404).json({ error: 'user not found' })
  user.depositedTotal = toFixed6(user.depositedTotal + value)
  await user.save()
  const deposit = await WalletDeposit.create({ userId: user._id, amount: value, txHash, chainId })
  const activeReservations = await Reservation.find({ userId: user._id, status: 'active' })
  const activeUsage = activeReservations.reduce((acc, r) => acc + (r.usedAmount || 0), 0)
  res.json({ deposit, summary: buildSummary(user, activeUsage) })
}

export async function processWallet(req, res){
  const userId = req.user.id
  const { userInput, inputType, audioData } = req.body
  
  if(!userInput){
    return res.status(400).json({ error: 'userInput is required' })
  }
  
  try {
    const user = await User.findById(userId)
    if(!user){
      return res.status(404).json({ error: 'User not found' })
    }
    
    // Get wallet summary for context
    const activeReservations = await Reservation.find({ userId: user._id, status: 'active' })
    const activeUsage = activeReservations.reduce((acc, r) => acc + (r.usedAmount || 0), 0)
    const summary = buildSummary(user, activeUsage)
    
    // Get last approval for context
    const lastApproval = await WalletApproval.findOne({ userId: user._id }).sort({ createdAt: -1 })
    
    // Process with crew agent (Gemini + Eleven Labs if voice)
    let agentInput = userInput
    if(inputType === 'voice' && audioData){
      agentInput = audioData
    }
    
    const axios = (await import('axios')).default
    const agentResponse = await axios.post(`${process.env.AGENTS_BASE_URL}/wallet/process`, {
      userId,
      userInput: agentInput,
      inputType: inputType || 'text',
      walletContext: {
        availableAllowance: summary.availableAllowance,
        lastApprovalAmount: lastApproval?.amount || 0,
      },
    })
    
    if(!agentResponse.data.success){
      return res.status(500).json({ error: agentResponse.data.error || 'Wallet processing failed' })
    }
    
    const { action, amount, transcribedText } = agentResponse.data
    
    res.json({
      success: true,
      action,
      amount,
      transcribedText,
    })
  } catch (error){
    console.error('Process wallet error:', error)
    res.status(500).json({ error: error.message || 'Wallet processing failed' })
  }
}
