import axios from 'axios'
import mongoose from 'mongoose'
import { Creator, FinalizedRead, NegLog, Post, Reservation, Tip, User } from '../../models/index.js'

export async function getCreatorMenu(req, res){
  const { postId } = req.query
  const post = await Post.findById(postId)
  if(!post) return res.status(404).json({ error: 'post not found' })
  const creator = await Creator.findById(post.creatorId)
  res.json({
    perMinFloor: creator.menu.perMinFloor,
    perReadFloor: creator.menu.perReadFloor,
    suggestedPerMin: creator.menu.suggestedPerMin,
    suggestedPerRead: creator.menu.suggestedPerRead,
    trustScore: creator.trustScore,
    creatorId: creator._id,
    length: post.length,
  })
}

export async function getUserBudget(req, res){
  const { userId } = req.query
  const user = await User.findById(userId)
  const bucketSpent = user.bucketSpent?.[user.bucket] || 0
  const bucketTightness = Math.min(1, bucketSpent / Math.max(1, user.dailyCap))
  res.json({
    dailyCap: user.dailyCap,
    budgetLeft: Math.max(0, user.dailyCap - user.spentToday),
    bucket: user.bucket,
    priceSensitivity: user.priceSensitivity,
    bucketTightness,
  })
}

export async function meterPreview(req, res){
  const { ms = 5000 } = req.body
  const attentionScore = 0.6
  const estMinutes = Math.max(1, Math.round((ms / 1000) / 45))
  res.json({ attentionScore, estMinutes })
}

// Aggregate tips and post metrics to inform negotiation
export async function getNegotiationContext(req, res){
  try {
    const { userId, postId } = req.query
    if(!postId){
      return res.status(400).json({ error: 'postId required' })
    }

    const post = await Post.findById(postId)
    if(!post){
      return res.status(404).json({ error: 'post not found' })
    }
    const creator = await Creator.findById(post.creatorId)
    if(!creator){
      return res.status(404).json({ error: 'creator not found' })
    }

    // Compute word count and reading time estimate
    const content = post.content || ''
    const wordCount = content
      ? (content.match(/\b\w+\b/g)?.length || 0)
      : (post.length === 'short' ? 400 : post.length === 'long' ? 1500 : 800)
    const wordsPerMinute = 200
    const estMinutes = Math.max(1, Math.ceil(wordCount / wordsPerMinute))

    // Tip aggregates (no auth) scoped to post and creator; optionally user if provided
    const [postTipsAgg, creatorTipsAgg, userToCreatorAgg, userToPostAgg, userReadsAgg, userCreatorReadsAgg] = await Promise.all([
      Tip.aggregate([
        { $match: { postId: post._id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Tip.aggregate([
        { $match: { creatorId: creator._id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      userId ? Tip.aggregate([
        { $match: { senderId: new mongoose.Types.ObjectId(userId), creatorId: creator._id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]) : Promise.resolve([]),
      userId ? Tip.aggregate([
        { $match: { senderId: new mongoose.Types.ObjectId(userId), postId: post._id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]) : Promise.resolve([]),
      userId ? FinalizedRead.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: null, reads: { $sum: 1 }, minutes: { $sum: { $ifNull: ['$minutes', 0] } } } },
      ]) : Promise.resolve([]),
      userId ? FinalizedRead.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId), creatorId: creator._id } },
        { $group: { _id: null, reads: { $sum: 1 }, minutes: { $sum: { $ifNull: ['$minutes', 0] } } } },
      ]) : Promise.resolve([]),
    ])

    const tipStats = {
      postTotal: +(postTipsAgg?.[0]?.total || 0).toFixed(6),
      postCount: postTipsAgg?.[0]?.count || 0,
      creatorTotal: +(creatorTipsAgg?.[0]?.total || 0).toFixed(6),
      creatorCount: creatorTipsAgg?.[0]?.count || 0,
      userToCreatorTotal: +(userToCreatorAgg?.[0]?.total || 0).toFixed(6),
      userToCreatorCount: userToCreatorAgg?.[0]?.count || 0,
      userToPostTotal: +(userToPostAgg?.[0]?.total || 0).toFixed(6),
      userToPostCount: userToPostAgg?.[0]?.count || 0,
    }

    res.json({
      creator: {
        id: creator._id,
        trustScore: creator.trustScore,
        reputation: creator.reputation,
        menu: {
          perMinFloor: creator.menu.perMinFloor,
          perReadFloor: creator.menu.perReadFloor,
          suggestedPerMin: creator.menu.suggestedPerMin,
          suggestedPerRead: creator.menu.suggestedPerRead,
        },
      },
      post: {
        id: post._id,
        title: post.title,
        category: post.category,
        length: post.length,
        wordCount,
        estMinutes,
      },
      tips: tipStats,
      userStats: {
        readsTotal: userReadsAgg?.[0]?.reads || 0,
        minutesTotal: +(userReadsAgg?.[0]?.minutes || 0).toFixed(2),
        readsWithCreator: userCreatorReadsAgg?.[0]?.reads || 0,
        minutesWithCreator: +(userCreatorReadsAgg?.[0]?.minutes || 0).toFixed(2),
      },
    })
  } catch (e){
    console.error('getNegotiationContext error:', e)
    res.status(500).json({ error: e.message || 'failed to get negotiation context' })
  }
}

export async function recordNegotiationStep(req, res){
  const { negotiateId, userId, postId, step } = req.body
  await NegLog.create({ negotiateId, userId, postId, timeline: [step] })
  res.json({ ok: true })
}

function computeApprovedAmount(mode, rateOrPrice, minMinutes, capMinutes){
  if(mode === 'per_minute'){
    const minutes = capMinutes ?? minMinutes ?? 1
    return +(Number(minutes) * Number(rateOrPrice)).toFixed(3)
  }
  return +(Number(rateOrPrice)).toFixed(2)
}

export async function createReservation(req, res){
  const { userId, postId, creatorId, mode, rateOrPrice, minMinutes, capMinutes, ttlSec } = req.body
  // Determine a sensible default TTL if none provided: long enough to read
  const computedTtlSec = ttlSec ?? (mode === 'per_minute'
    ? Math.max(600, ((capMinutes ?? 15) * 60) + 120) // cap minutes + 2min buffer, at least 10min
    : 900 // per_read: 15 minutes window
  )
  const expiresAt = new Date(Date.now() + computedTtlSec * 1000)
  const user = await User.findById(userId)
  if(!user) return res.status(404).json({ error: 'user not found' })
  const approvedAmount = computeApprovedAmount(mode, rateOrPrice, minMinutes, capMinutes)
  const available = +(user.approvedTotal - (user.usedTotal + user.pendingHold)).toFixed(6)
  if(approvedAmount > available){
    return res.status(400).json({ error: 'insufficient approved allowance', approvedAmount, available })
  }
  const normalizedCap = mode === 'per_minute' ? (capMinutes ?? Math.max(minMinutes ?? 1, 1)) : capMinutes
  const reservation = await Reservation.create({
    userId,
    postId,
    creatorId,
    mode,
    rateOrPrice,
    minMinutes,
    capMinutes: normalizedCap,
    ttlSec: computedTtlSec,
    expiresAt,
    approvedAmount,
  })
  user.pendingHold = +(user.pendingHold + approvedAmount).toFixed(6)
  user.approvedAllowance = Math.max(0, +(user.approvedAllowance - approvedAmount).toFixed(6))
  await user.save()
  res.json({ reservationId: reservation._id, expiresAt, approvedAmount })
}

export async function startNegotiation(req, res){
  const { userId, postId } = req.body
  const post = await Post.findById(postId)
  if(!post) return res.status(404).json({ error: 'post not found' })
  
  if(!process.env.AGENTS_BASE_URL){
    console.error('agents error: AGENTS_BASE_URL not configured')
    return res.status(500).json({ error: 'agents service not configured' })
  }
  
  try {
    const resp = await axios.post(`${process.env.AGENTS_BASE_URL}/negotiate`, { userId, postId }, {
      timeout: 0, // no timeout: let negotiation complete
    })
    res.json(resp.data)
  } catch (e){
    const errorMsg = e?.response?.data || e.message || 'Unknown error'
    console.error('agents error', errorMsg)
    
    // Provide more specific error messages
    if(e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET'){
      res.status(503).json({ error: 'agents service unavailable - ensure the agents service is running' })
    } else if(e.code === 'ETIMEDOUT'){
      res.status(504).json({ error: 'agents service timeout - negotiation took too long' })
    } else {
      res.status(500).json({ error: 'agents unavailable', details: errorMsg })
    }
  }
}
