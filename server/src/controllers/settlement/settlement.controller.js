import { ethers } from 'ethers'
import mongoose from 'mongoose'
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
  // Check if there's already a draft batch that hasn't been distributed
  const existingDraftBatch = await SettlementBatch.findOne({ status: 'draft' }).sort({ createdAt: -1 })
  if(existingDraftBatch){
    // CRITICAL: Verify that the reads in this batch are still unsettled
    const readsByCreator = existingDraftBatch.readsByCreator || {}
    const readIds = Object.values(readsByCreator).flat().map(r => {
      try {
        return mongoose.Types.ObjectId.isValid(r.id) ? new mongoose.Types.ObjectId(r.id) : null
      } catch {
        return null
      }
    }).filter(id => id !== null)
    
    // Check if any of these reads have already been settled (in a different batch)
    const alreadySettled = await FinalizedRead.countDocuments({
      _id: { $in: readIds },
      settlementBatchId: { $exists: true, $ne: null, $ne: existingDraftBatch._id }
    })
    
    if(alreadySettled > 0){
      // Some reads have already been settled - this batch is invalid, delete it and create a new one
      console.warn(`Draft batch ${existingDraftBatch._id} contains ${alreadySettled} already-settled reads. Deleting invalid batch.`)
      await SettlementBatch.findByIdAndDelete(existingDraftBatch._id)
      // Fall through to create a new batch below
    } else {
      // All reads are still unsettled, return the existing batch
      const totals = existingDraftBatch.totals || {}
      
      // Hydrate creators for convenience
      const creatorIds = Object.keys(totals).map(id => {
        try {
          return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null
        } catch {
          return null
        }
      }).filter(id => id !== null)
      
      const creators = await Creator.find({ _id: { $in: creatorIds } })
      const creatorMap = Object.fromEntries(creators.map(c => [String(c._id), { name: c.name, wallet: c.wallet }]))
      
      return res.json({ 
        totals, 
        batchId: existingDraftBatch._id, 
        readsByCreator, 
        creators: creatorMap,
        existingBatch: true 
      })
    }
  }

  // Aggregate ALL unsettled finalized reads (valid=true and no settlementBatchId)
  // Use a more explicit query to ensure we only get truly unsettled reads
  const unsettled = await FinalizedRead.find({ 
    valid: true,
    $or: [
      { settlementBatchId: { $exists: false } },
      { settlementBatchId: null },
      { settlementBatchId: { $eq: null } }
    ]
  })
  
  // Double-check: filter out any reads that might have a settlementBatchId despite the query
  const trulyUnsettled = unsettled.filter(fr => !fr.settlementBatchId || fr.settlementBatchId === null)
  
  if(trulyUnsettled.length === 0){
    return res.json({ totals: {}, creators: [], batchId: null, readsByCreator: {} })
  }
  
  if(trulyUnsettled.length !== unsettled.length){
    console.warn(`Filtered out ${unsettled.length - trulyUnsettled.length} reads that had settlementBatchId despite query`)
  }

  // Accumulate amounts per creator - each creator gets their own total
  const totals = {}
  const readsByCreator = {}
  for(const fr of trulyUnsettled){
    if(!fr.creatorId) continue // Skip if no creator ID
    const creatorKey = String(fr.creatorId)
    const debitAmount = Number(fr.debit) || 0
    // Accumulate: add each read's debit to the creator's total
    if(!totals[creatorKey]) totals[creatorKey] = 0
    totals[creatorKey] = Number((totals[creatorKey] + debitAmount).toFixed(6))
    if(!readsByCreator[creatorKey]) readsByCreator[creatorKey] = []
    readsByCreator[creatorKey].push({ id: fr._id, postId: fr.postId, debit: fr.debit, ts: fr.ts, mode: fr.mode, minutes: fr.minutes, reads: fr.reads })
  }

  const now = new Date()
  const batch = await SettlementBatch.create({ date: ymd(now), totals, status: 'draft', readsByCreator })

  // Hydrate creators for convenience - properly convert string IDs to ObjectIds
  const creatorIds = Object.keys(totals).map(id => {
    try {
      return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null
    } catch {
      return null
    }
  }).filter(id => id !== null)
  
  const creators = await Creator.find({ _id: { $in: creatorIds } })
  const creatorMap = Object.fromEntries(creators.map(c => [String(c._id), { name: c.name, wallet: c.wallet }]))

  res.json({ totals, batchId: batch._id, readsByCreator, creators: creatorMap, existingBatch: false })
}

export async function distributeSettlements(req, res){
  const { batchId } = req.body
  const batch = await SettlementBatch.findById(batchId)
  if(!batch) return res.status(404).json({ error: 'batch not found' })

  // Prevent re-distribution of already distributed batches
  if(batch.status === 'distributed'){
    return res.status(400).json({ 
      error: 'Batch already distributed', 
      txHash: batch.txHash,
      distributedAt: batch.updatedAt 
    })
  }

  // Ensure batch is in draft status before distributing
  if(batch.status !== 'draft'){
    return res.status(400).json({ 
      error: `Cannot distribute batch with status: ${batch.status}` 
    })
  }

  const totals = batch.totals || {}
  if(Object.keys(totals).length === 0){
    return res.status(400).json({ error: 'No totals to distribute' })
  }

  // Convert creator ID strings to ObjectIds for proper MongoDB query
  const creatorIdStrings = Object.keys(totals)
  const creatorObjectIds = creatorIdStrings
    .map(id => {
      try {
        return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null
      } catch {
        return null
      }
    })
    .filter(id => id !== null)

  if(creatorObjectIds.length === 0){
    return res.status(400).json({ error: 'No valid creator IDs found' })
  }

  // Fetch creator documents with their wallet addresses
  const creatorDocs = await Creator.find({ _id: { $in: creatorObjectIds } })
  if(creatorDocs.length === 0){
    return res.status(400).json({ error: 'No creators found for settlement' })
  }

  // Build map of creator ID (as string) to wallet address
  const creatorWalletMap = Object.fromEntries(
    creatorDocs.map(c => [String(c._id), c.wallet])
  )

  // Build arrays for distribution - one entry per creator with their accumulated total
  const addresses = []
  const amounts = []
  const distributionLog = []

  for(const creatorIdStr of creatorIdStrings){
    const wallet = creatorWalletMap[creatorIdStr]
    const totalAmount = Number(totals[creatorIdStr]) || 0

    // Skip creators without wallets or with zero amounts
    if(!wallet || !wallet.trim() || totalAmount <= 0){
      console.warn(`Skipping creator ${creatorIdStr}: wallet=${wallet}, amount=${totalAmount}`)
      continue
    }

    // Each creator gets their own entry with their accumulated total
    addresses.push(wallet)
    // Convert amount to USDC units (6 decimals)
    amounts.push(ethers.parseUnits(totalAmount.toFixed(6), 6))
    distributionLog.push({ creatorId: creatorIdStr, wallet, amount: totalAmount })
  }

  if(addresses.length === 0){
    return res.status(400).json({ error: 'No valid creator wallets found for distribution' })
  }

  // Validate that we have matching arrays
  if(addresses.length !== amounts.length){
    return res.status(500).json({ error: 'Mismatch between addresses and amounts arrays' })
  }

  // CRITICAL: Before distribution, verify all reads in this batch are still unsettled
  const readsByCreator = batch.readsByCreator || {}
  const readIds = Object.values(readsByCreator).flat().map(r => {
    try {
      return mongoose.Types.ObjectId.isValid(r.id) ? new mongoose.Types.ObjectId(r.id) : null
    } catch {
      return null
    }
  }).filter(id => id !== null)
  
  if(readIds.length > 0){
    // Fetch all reads to verify their current state - do this RIGHT before distribution
    const readsToSettle = await FinalizedRead.find({ _id: { $in: readIds } })
    
    // Check if any reads have already been settled (in any batch)
    const alreadySettled = readsToSettle.filter(r => {
      const batchId = r.settlementBatchId
      return batchId && String(batchId) !== String(batch._id)
    })
    
    if(alreadySettled.length > 0){
      const settledBatchIds = [...new Set(alreadySettled.map(r => String(r.settlementBatchId)))]
      console.error(`BLOCKING DISTRIBUTION: ${alreadySettled.length} reads already settled in batch(es): ${settledBatchIds.join(', ')}`)
      return res.status(400).json({ 
        error: `Cannot distribute: ${alreadySettled.length} reads have already been settled in batch(es): ${settledBatchIds.join(', ')}`,
        batchId: batch._id,
        alreadySettledCount: alreadySettled.length,
        settledBatchIds
      })
    }
    
    // Verify all reads exist and are valid
    const invalidReads = readsToSettle.filter(r => !r.valid)
    if(invalidReads.length > 0){
      return res.status(400).json({ 
        error: `Batch contains ${invalidReads.length} invalid reads that cannot be settled`,
        batchId: batch._id
      })
    }
    
    // Verify we found all reads
    if(readsToSettle.length !== readIds.length){
      return res.status(400).json({ 
        error: `Batch references ${readIds.length} reads but only ${readsToSettle.length} were found in database`,
        batchId: batch._id
      })
    }
    
    // Final verification: ensure NONE of the reads have a settlementBatchId
    const readsWithBatchId = readsToSettle.filter(r => r.settlementBatchId && String(r.settlementBatchId) !== String(batch._id))
    if(readsWithBatchId.length > 0){
      console.error(`BLOCKING DISTRIBUTION: Found ${readsWithBatchId.length} reads with existing settlementBatchId`)
      return res.status(400).json({ 
        error: `Cannot distribute: ${readsWithBatchId.length} reads already have a settlementBatchId`,
        batchId: batch._id
      })
    }
  }

  console.log(`Distributing to ${addresses.length} creators for batch ${batch._id}:`, distributionLog)

  // Execute the vault transfer - this sends to each creator individually
  const result = await executeVaultTransfer(addresses, amounts)

  // Mark reads as settled - use atomic update with condition to prevent double-settlement
  if(readIds.length > 0){
    const updateResult = await FinalizedRead.updateMany(
      { 
        _id: { $in: readIds },
        // Only update if not already settled
        $or: [
          { settlementBatchId: { $exists: false } },
          { settlementBatchId: null }
        ]
      },
      { $set: { settlementBatchId: batch._id, settledAt: new Date() } }
    )
    
    // Verify that all reads were actually updated
    if(updateResult.modifiedCount !== readIds.length){
      console.error(`WARNING: Only ${updateResult.modifiedCount} of ${readIds.length} reads were marked as settled. Some may have already been settled.`)
      
      // Double-check how many are actually settled now
      const actuallySettled = await FinalizedRead.countDocuments({
        _id: { $in: readIds },
        settlementBatchId: batch._id
      })
      
      if(actuallySettled !== readIds.length){
        return res.status(500).json({ 
          error: `Failed to mark all reads as settled. Expected ${readIds.length}, but only ${actuallySettled} were updated.`,
          batchId: batch._id,
          modifiedCount: updateResult.modifiedCount,
          actuallySettled
        })
      }
    }
    
    console.log(`Successfully marked ${updateResult.modifiedCount} reads as settled for batch ${batch._id}`)
  }

  batch.txHash = result.txHash
  batch.status = 'distributed'
  await batch.save()

  res.json({ 
    txHash: result.txHash, 
    mocked: result.mocked, 
    batchId: batch._id,
    distributionCount: addresses.length,
    distributionLog 
  })
}

export async function listRecentSettlements(req, res){
  const batches = await SettlementBatch.find({}).sort({ createdAt: -1 }).limit(10)
  const creators = await Creator.find({})
  const creatorMap = Object.fromEntries(creators.map(c => [String(c._id), { name: c.name, wallet: c.wallet }]))
  res.json({ batches, creators: creatorMap })
}
