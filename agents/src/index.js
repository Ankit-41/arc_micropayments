import 'dotenv/config'
import express from 'express'
import morgan from 'morgan'
import axios from 'axios'
import { handleTipRequest } from './tipAgent.js'
import { handleNegotiation } from './negotiationAgent.js'
import { handleOrchestrator } from './orchestratorAgent.js'
import { handleWalletRequest } from './walletAgent.js'

const app = express()
app.use(morgan('dev'))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

const PORT = process.env.PORT || 8000
const SERVER = process.env.SERVER_BASE_URL || 'http://localhost:4000'

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)) }
function lerp(a,b,t){ return a + (b-a)*t }

app.get('/', (req,res)=>res.json({ ok:true, service:'agents' }))

app.post('/negotiate', async (req,res)=>{
  try {
    const start = Date.now()
    const { userId, postId } = req.body
    console.log('[NEG] /negotiate called', { userId, postId, SERVER })
    const result = await handleNegotiation({ SERVER, userId, postId })
    const { finalTerms, ctx, consumerTerms, creatorTerms } = result
    console.log('[NEG] negotiation complete in', Date.now() - start, 'ms')
    console.log('[NEG] final terms:', finalTerms)
    console.log('[NEG] consumer terms:', consumerTerms)
    console.log('[NEG] creator terms:', creatorTerms)
    res.json({ status: 'ok', terms: finalTerms, creatorId: ctx.creator.id, debug: result })
  } catch (e){
    console.error('[NEG] Negotiation error:', e?.response?.data || e.message, e.stack)
    res.status(500).json({ error: e.message || 'Negotiation failed' })
  }
})

// Tip processing endpoint with crew agent
app.post('/tip/process', async (req, res)=>{
  try {
    const { userId, postId, creatorId, userInput, inputType, postContext } = req.body
    
    if(!userId || !postId || !creatorId || !userInput){
      return res.status(400).json({ error: 'Missing required fields' })
    }
    
    const result = await handleTipRequest({
      userId,
      postId,
      creatorId,
      userInput,
      inputType: inputType || 'text',
      postContext: postContext || {},
    })
    
    if(!result.success){
      return res.status(500).json({ error: result.error || 'Tip processing failed' })
    }
    
    res.json({
      success: true,
      amount: result.amount,
      message: result.message,
      transcribedText: result.transcribedText,
    })
  } catch (error){
    console.error('Tip endpoint error:', error)
    res.status(500).json({ error: error.message || 'Tip processing failed' })
  }
})

// Orchestrator (tip/approve/deposit intent)
app.post('/orchestrator/process', async (req, res)=>{
  try {
    const { userInput, inputType } = req.body
    if(!userInput){
      return res.status(400).json({ error: 'Missing userInput' })
    }
    const result = await handleOrchestrator({ userInput, inputType: inputType || 'text' })
    if(!result.success){
      return res.status(500).json({ error: result.error || 'Orchestrator failed' })
    }
    res.json(result)
  } catch (error){
    console.error('Orchestrator endpoint error:', error)
    res.status(500).json({ error: error.message || 'Orchestrator failed' })
  }
})

// Wallet processing endpoint with crew agent
app.post('/wallet/process', async (req, res)=>{
  try {
    const { userId, userInput, inputType, walletContext } = req.body
    
    if(!userId || !userInput){
      return res.status(400).json({ error: 'Missing required fields' })
    }
    
    const result = await handleWalletRequest({
      userId,
      userInput,
      inputType: inputType || 'text',
      walletContext: walletContext || {},
    })
    
    if(!result.success){
      return res.status(500).json({ error: result.error || 'Wallet processing failed' })
    }
    
    res.json({
      success: true,
      action: result.action,
      amount: result.amount,
      transcribedText: result.transcribedText,
    })
  } catch (error){
    console.error('Wallet endpoint error:', error)
    res.status(500).json({ error: error.message || 'Wallet processing failed' })
  }
})

app.listen(PORT, ()=>console.log('Agents on', PORT))
