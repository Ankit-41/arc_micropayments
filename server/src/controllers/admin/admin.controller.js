import { FinalizedRead, User, WalletApproval, WalletDeposit } from '../../models/index.js'

function mapApproval(doc){
  return {
    id: doc._id,
    userId: doc.userId?._id ?? doc.userId,
    userEmail: doc.userId?.email,
    amount: Number(doc.amount || 0),
    txHash: doc.txHash,
    chainId: doc.chainId,
    createdAt: doc.createdAt,
  }
}

function mapDeposit(doc){
  return {
    id: doc._id,
    userId: doc.userId?._id ?? doc.userId,
    userEmail: doc.userId?.email,
    amount: Number(doc.amount || 0),
    txHash: doc.txHash,
    chainId: doc.chainId,
    createdAt: doc.createdAt,
  }
}

function mapCredit(doc){
  return {
    id: doc._id,
    creatorId: doc.creatorId?._id ?? doc.creatorId,
    userId: doc.userId?._id ?? doc.userId,
    userEmail: doc.userId?.email,
    creatorWallet: doc.creatorId?.wallet,
    debit: Number(doc.debit || 0),
    postId: doc.postId,
    mode: doc.mode,
    ts: doc.ts,
  }
}

export async function getAdminOverview(req, res){
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10))
  const page = Math.max(0, Number(req.query.page) || 0)
  const skip = page * limit

  const [aggregateTotals] = await User.aggregate([
    {
      $group: {
        _id: null,
        approvedTotal: { $sum: '$approvedTotal' },
        usedTotal: { $sum: '$usedTotal' },
        depositedTotal: { $sum: '$depositedTotal' },
        pendingHold: { $sum: '$pendingHold' },
      },
    },
  ])

  const [approvals, deposits, credits, approvalCount, depositCount, creditCount] = await Promise.all([
    WalletApproval.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'email'),
    WalletDeposit.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'email'),
    FinalizedRead.find({ valid: true }).sort({ ts: -1 }).skip(skip).limit(limit).populate('userId', 'email').populate('creatorId', 'wallet'),
    WalletApproval.countDocuments(),
    WalletDeposit.countDocuments(),
    FinalizedRead.countDocuments({ valid: true }),
  ])

  res.json({
    totals: {
      approvedTotal: Number(aggregateTotals?.approvedTotal || 0),
      usedTotal: Number(aggregateTotals?.usedTotal || 0),
      depositedTotal: Number(aggregateTotals?.depositedTotal || 0),
      pendingHold: Number(aggregateTotals?.pendingHold || 0),
    },
    approvals: approvals.map(mapApproval),
    deposits: deposits.map(mapDeposit),
    credits: credits.map(mapCredit),
    pagination: {
      page,
      limit,
      approvals: { total: approvalCount, hasNext: skip + limit < approvalCount },
      deposits: { total: depositCount, hasNext: skip + limit < depositCount },
      credits: { total: creditCount, hasNext: skip + limit < creditCount },
    },
  })
}
