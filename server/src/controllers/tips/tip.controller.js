import axios from 'axios'
import { ethers } from 'ethers'
import { Creator, Post, Tip, User } from '../../models/index.js'

const USDC_ADDRESS = process.env.USDC_ADDRESS || process.env.VITE_USDC_ADDRESS
const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function',
  },
]

/**
 * Process tip request using crew agent, then initiate MetaMask transaction
 */
export async function processTip(req, res){
  const { postId, userInput, inputType, audioData } = req.body
  const userId = req.user.id
  
  if(!postId || !userInput){
    return res.status(400).json({ error: 'postId and userInput required' })
  }
  
  try {
    // Get post and creator info
    const post = await Post.findById(postId).populate('creatorId')
    if(!post || !post.creatorId){
      return res.status(404).json({ error: 'Post or creator not found' })
    }
    
    const creator = await Creator.findById(post.creatorId)
    if(!creator || !creator.wallet){
      return res.status(404).json({ error: 'Creator wallet not found' })
    }
    
    const sender = await User.findById(userId)
    if(!sender || !sender.wallet){
      return res.status(400).json({ error: 'Sender wallet not connected' })
    }
    
    // Process with crew agent (Gemini + Eleven Labs if voice)
    let agentInput = userInput
    if(inputType === 'voice' && audioData){
      // Convert base64 audio to buffer if needed
      agentInput = audioData
    }
    
    const agentResponse = await axios.post(`${process.env.AGENTS_BASE_URL}/tip/process`, {
      userId,
      postId,
      creatorId: creator._id.toString(),
      userInput: agentInput,
      inputType: inputType || 'text',
      postContext: {
        title: post.title,
        category: post.category,
      },
    })
    
    if(!agentResponse.data.success){
      return res.status(500).json({ error: agentResponse.data.error || 'Tip processing failed' })
    }
    
    const { amount, message, transcribedText } = agentResponse.data
    
    // Check if user has sufficient approved allowance
    const availableAllowance = Math.max(0, +(sender.approvedTotal - sender.usedTotal - sender.pendingHold).toFixed(6))
    
    if(amount > availableAllowance){
      return res.status(400).json({ 
        error: 'insufficient approved allowance',
        requiredAmount: amount,
        availableAllowance,
        needsApproval: true,
      })
    }
    
    // Create tip record with pending status
    const tip = await Tip.create({
      senderId: userId,
      creatorId: creator._id,
      postId,
      amount,
      message: transcribedText || message || '',
      inputType: inputType || 'text',
      status: 'pending',
    })
    
    // Return data for frontend to trigger MetaMask transaction
    res.json({
      tipId: tip._id,
      amount,
      message: transcribedText || message || '',
      creatorWallet: creator.wallet,
      senderWallet: sender.wallet,
      usdcAddress: USDC_ADDRESS,
      transcribedText,
    })
  } catch (error){
    console.error('Tip processing error:', error)
    res.status(500).json({ error: error.message || 'Tip processing failed' })
  }
}

/**
 * Confirm tip transaction after MetaMask completes
 */
export async function confirmTip(req, res){
  const { tipId, txHash, chainId } = req.body
  const userId = req.user.id
  
  if(!tipId || !txHash){
    return res.status(400).json({ error: 'tipId and txHash required' })
  }
  
  try {
    const tip = await Tip.findById(tipId)
    if(!tip){
      return res.status(404).json({ error: 'Tip not found' })
    }
    
    if(tip.senderId.toString() !== userId.toString()){
      return res.status(403).json({ error: 'Unauthorized' })
    }
    
    // Update tip with transaction info
    tip.txHash = txHash
    tip.chainId = chainId
    tip.status = 'completed'
    await tip.save()
    
    // Update user stats - increase usedTotal and decrease approvedAllowance by tip amount
    const sender = await User.findById(userId)
    if(sender){
      const oldUsedTotal = sender.usedTotal
      const oldApprovedAllowance = sender.approvedAllowance
      
      // Increase usedTotal by tip amount
      sender.usedTotal = +(sender.usedTotal + tip.amount).toFixed(6)
      
      // Decrease approvedAllowance (recalculate: approvedTotal - usedTotal - pendingHold)
      sender.approvedAllowance = Math.max(0, +(sender.approvedTotal - sender.usedTotal - sender.pendingHold).toFixed(6))
      
      await sender.save()
      
      console.log(`[Tip] Updated user ${userId} after tip of ${tip.amount} USDC:`)
      console.log(`  usedTotal: ${oldUsedTotal} → ${sender.usedTotal} (+${tip.amount})`)
      console.log(`  approvedAllowance: ${oldApprovedAllowance} → ${sender.approvedAllowance} (-${(oldApprovedAllowance - sender.approvedAllowance).toFixed(6)})`)
    }
    
    res.json({ success: true, tip })
  } catch (error){
    console.error('Tip confirmation error:', error)
    res.status(500).json({ error: error.message || 'Tip confirmation failed' })
  }
}

/**
 * Get tip history for a user
 */
export async function getTipHistory(req, res){
  const userId = req.user.id
  const { type = 'sent' } = req.query // 'sent' or 'received'
  
  try {
    let query = {}
    if(type === 'sent'){
      query = { senderId: userId }
    } else {
      // For received tips, we need to find via creatorId
      const user = await User.findById(userId)
      const creator = await Creator.findOne({ userId: user._id })
      if(creator){
        query = { creatorId: creator._id }
      } else {
        return res.json({ tips: [] })
      }
    }
    
    const tips = await Tip.find(query)
      .populate('senderId', 'email')
      .populate('creatorId', 'wallet')
      .populate('postId', 'title slug')
      .sort({ createdAt: -1 })
      .limit(50)
    
    res.json({ tips })
  } catch (error){
    console.error('Get tip history error:', error)
    res.status(500).json({ error: error.message || 'Failed to get tip history' })
  }
}

