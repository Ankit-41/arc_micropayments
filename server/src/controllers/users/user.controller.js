import { Reservation, User } from '../../models/index.js'

export async function updateUser(req, res){
  if(req.user.id !== req.params.id) return res.status(403).json({ error: 'Forbidden' })
  const { dailyCap, preferences, wallet, priceSensitivity, bucket } = req.body
  const update = {}
  if(dailyCap !== undefined) update.dailyCap = dailyCap
  if(preferences !== undefined) update.preferences = preferences
  if(wallet !== undefined) update.wallet = wallet
  if(priceSensitivity !== undefined) update.priceSensitivity = priceSensitivity
  if(bucket !== undefined) update.bucket = bucket
  const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true })
  res.json({ user })
}

export async function getUsageSummary(req, res){
  if(req.user.id !== req.params.id && req.user.role !== 'admin'){
    return res.status(403).json({ error: 'Forbidden' })
  }
  const user = await User.findById(req.params.id)
  if(!user) return res.status(404).json({ error: 'User not found' })
  const activeReservations = await Reservation.find({ userId: user._id, status: 'active' })
  const activeUsage = activeReservations.reduce((acc, r) => acc + (r.usedAmount || 0), 0)
  const usedTotal = Number((user.usedTotal + activeUsage).toFixed(6))
  const summary = {
    approvedTotal: Number(user.approvedTotal.toFixed(6)),
    usedTotal,
    depositedTotal: Number(user.depositedTotal.toFixed(6)),
    activeUsage: Number(activeUsage.toFixed(6)),
    lifetimeUsed: Number(user.usedTotal.toFixed(6)),
    availableAllowance: Math.max(0, Number((user.approvedTotal - user.usedTotal - user.pendingHold).toFixed(6))),
    percentUsed: user.approvedTotal > 0 ? Math.min(1, usedTotal / user.approvedTotal) : 0,
  }
  res.json({ summary })
}
