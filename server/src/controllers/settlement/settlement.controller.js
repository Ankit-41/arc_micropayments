import { ethers } from 'ethers'
import Vault from '../../../../foundry/hello-arc/out/PayoutVault.sol/PayoutVault.json' assert { type: 'json' }
import { Creator, FinalizedRead, SettlementBatch } from '../../models/index.js'

function ymd(date){
  return new Date(date).toISOString().slice(0, 10)
}

async function executeVaultTransfer(addresses, amounts){
  const rpc = process.env.RPC_URL
  const pk = process.env.PRIVATE_KEY
  const vaultAddr = process.env.VAULT_ADDRESS
  if(!rpc || !pk || !vaultAddr){
    return { txHash: '0xmock_' + Math.random().toString(16).slice(2), mocked: true }
  }
  const provider = new ethers.JsonRpcProvider(rpc)
  const wallet = new ethers.Wallet(pk, provider)
  const vault = new ethers.Contract(vaultAddr, Vault.abi, wallet)
  const tx = await vault.distribute(addresses, amounts)
  const receipt = await tx.wait()
  return { txHash: receipt.hash, mocked: false }
}

export async function aggregateSettlements(req, res){
  const { isoDate } = req.body
  const start = new Date(isoDate + 'T00:00:00Z')
  const end = new Date(isoDate + 'T23:59:59Z')
  const reads = await FinalizedRead.find({ ts: { $gte: start, $lte: end }, valid: true })
  const totals = {}
  for(const fr of reads){
    const key = String(fr.creatorId)
    totals[key] = +((totals[key] || 0) + fr.debit).toFixed(6)
  }
  const batch = await SettlementBatch.create({ date: ymd(start), totals, status: 'draft' })
  res.json({ totals, batchId: batch._id })
}

export async function distributeSettlements(req, res){
  const { totals } = req.body
  const creators = Object.keys(totals || {})
  const addresses = []
  const amounts = []
  for(const creatorId of creators){
    const creator = await Creator.findById(creatorId)
    if(!creator?.wallet) continue
    addresses.push(creator.wallet)
    amounts.push(ethers.parseUnits(String(totals[creatorId]), 6))
  }
  if(addresses.length === 0){
    return res.json({ txHash: '0xmock_empty_' + Math.random().toString(16).slice(2), mocked: true })
  }
  const result = await executeVaultTransfer(addresses, amounts)
  const today = ymd(new Date())
  const batch = await SettlementBatch.findOneAndUpdate(
    { date: today },
    { $set: { txHash: result.txHash, status: 'distributed' } },
    { new: true },
  )
  res.json({ txHash: result.txHash, mocked: result.mocked, batchId: batch?._id })
}
