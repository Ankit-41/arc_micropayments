import { ethers } from 'ethers'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { FinalizedRead, User, WalletApproval, WalletDeposit, Tip } from '../../models/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const vaultPath = path.join(__dirname, '../../../../foundry/hello-arc/out/PayoutVault.sol/PayoutVault.json')

let Vault
try {
  Vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'))
} catch (error) {
  console.error('Failed to load PayoutVault.json:', error.message)
  console.error('Expected path:', vaultPath)
  // Provide a minimal fallback structure if file is missing
  Vault = { abi: [] }
}

async function getVaultBalance(){
  const rpc = process.env.RPC_URL
  const vaultAddr = process.env.VAULT_ADDRESS
  if(!rpc || !vaultAddr){
    // Return null if vault is not configured (will show as "N/A" in UI)
    return null
  }
  try {
    const provider = new ethers.JsonRpcProvider(rpc)
    const vault = new ethers.Contract(vaultAddr, Vault.abi, provider)
    // totalPooled is a public variable, so we can read it directly
    const totalPooled = await vault.totalPooled()
    // USDC has 6 decimals, convert to readable format
    return Number(ethers.formatUnits(totalPooled, 6))
  } catch (error) {
    console.error('Error fetching vault balance:', error)
    return null
  }
}

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

function mapTip(doc){
  // Handle nested creator userId population
  let creatorEmail = null
  if(doc.creatorId && doc.creatorId.userId){
    creatorEmail = doc.creatorId.userId.email || null
  }
  
  return {
    id: doc._id,
    senderId: doc.senderId?._id ?? doc.senderId,
    senderEmail: doc.senderId?.email || null,
    creatorId: doc.creatorId?._id ?? doc.creatorId,
    creatorEmail: creatorEmail,
    postId: doc.postId?._id ?? doc.postId,
    postTitle: doc.postId?.title || null,
    amount: Number(doc.amount || 0),
    message: doc.message || '',
    status: doc.status,
    txHash: doc.txHash || null,
    chainId: doc.chainId || null,
    createdAt: doc.createdAt,
  }
}

export async function getAdminOverview(req, res){
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10))
  const page = Math.max(0, Number(req.query.page) || 0)
  const skip = page * limit

  const [aggregateTotals, vaultBalance] = await Promise.all([
    User.aggregate([
      {
        $group: {
          _id: null,
          approvedTotal: { $sum: '$approvedTotal' },
          usedTotal: { $sum: '$usedTotal' },
          depositedTotal: { $sum: '$depositedTotal' },
          pendingHold: { $sum: '$pendingHold' },
        },
      },
    ]),
    getVaultBalance(), // Fetch vault balance in parallel
  ])

  const [approvals, deposits, credits, tips, approvalCount, depositCount, creditCount, tipCount] = await Promise.all([
    WalletApproval.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'email'),
    WalletDeposit.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'email'),
    FinalizedRead.find({ valid: true }).sort({ ts: -1 }).skip(skip).limit(limit).populate('userId', 'email').populate('creatorId', 'wallet'),
    Tip.find().sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('senderId', 'email')
      .populate({ path: 'creatorId', populate: { path: 'userId', select: 'email' } })
      .populate('postId', 'title'),
    WalletApproval.countDocuments(),
    WalletDeposit.countDocuments(),
    FinalizedRead.countDocuments({ valid: true }),
    Tip.countDocuments(),
  ])

  res.json({
    totals: {
      approvedTotal: Number(aggregateTotals[0]?.approvedTotal || 0),
      usedTotal: Number(aggregateTotals[0]?.usedTotal || 0),
      depositedTotal: Number(aggregateTotals[0]?.depositedTotal || 0),
      pendingHold: Number(aggregateTotals[0]?.pendingHold || 0),
      vaultBalance: vaultBalance !== null ? Number(vaultBalance.toFixed(6)) : null,
    },
    approvals: approvals.map(mapApproval),
    deposits: deposits.map(mapDeposit),
    credits: credits.map(mapCredit),
    tips: tips.map(mapTip),
    pagination: {
      page,
      limit,
      approvals: { total: approvalCount, hasNext: skip + limit < approvalCount },
      deposits: { total: depositCount, hasNext: skip + limit < depositCount },
      credits: { total: creditCount, hasNext: skip + limit < creditCount },
      tips: { total: tipCount, hasNext: skip + limit < tipCount },
    },
  })
}
