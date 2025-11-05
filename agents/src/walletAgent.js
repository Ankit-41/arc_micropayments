import { GoogleGenerativeAI } from '@google/generative-ai'
import axios from 'axios'
import FormData from 'form-data'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY)

/**
 * Transcribe voice audio using Eleven Labs API
 */
export async function transcribeVoice(audioBase64, mimeType = 'audio/webm'){
  try {
    console.log('[Eleven Labs] Starting voice transcription...')
    console.log('[Eleven Labs] Audio data length (base64):', audioBase64?.length || 0, 'chars')
    console.log('[Eleven Labs] MIME type:', mimeType)
    
    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    console.log('[Eleven Labs] Audio buffer size:', audioBuffer.length, 'bytes')
    
    const formData = new FormData()
    formData.append('file', audioBuffer, {
      filename: 'audio.webm',
      contentType: mimeType,
    })
    formData.append('model_id', 'scribe_v1');
    console.log('[Eleven Labs] Sending request to Eleven Labs API...')
    const response = await axios.post(
      'https://api.elevenlabs.io/v1/speech-to-text',
      formData,
      {
        headers: {
          'xi-api-key': process.env.ELEVEN_LABS_API_KEY,
          ...formData.getHeaders(),
        },
      }
    )
    
    const transcribedText = response.data.text || ''
    console.log('[Eleven Labs] Transcription successful!')
    console.log('[Eleven Labs] Transcribed text:', transcribedText)
    
    return transcribedText
  } catch (error){
    console.error('[Eleven Labs] Transcription error:', error.response?.data || error.message)
    console.error('[Eleven Labs] Full error:', error)
    return ''
  }
}

/**
 * Process wallet request using Gemini AI to extract action type (approve/deposit) and amount
 */
export async function processWalletRequest(userInput, walletContext = {}){
  try {
    console.log('[Gemini] Processing wallet request...')
    console.log('[Gemini] User input:', userInput)
    console.log('[Gemini] Wallet context:', walletContext)
    
    const modelNames = ['gemini-2.5-flash', 'gemini-2.5-pro']
    let result
    let lastError
    
    for(const modelName of modelNames){
      try {
        console.log(`[Gemini] Trying model: ${modelName}`)
        const model = genAI.getGenerativeModel({ model: modelName })
        
        const prompt = `You are a wallet operations agent for a micropayments platform. 
Extract the action type (approve or deposit) and amount from the user's input.

User input: "${userInput}"

Wallet context:
- Available allowance: ${walletContext.availableAllowance || 0} USDC
- Last approval amount: ${walletContext.lastApprovalAmount || 0} USDC

Action types:
- "approve" or "approval" - User wants to approve an allowance amount (e.g., "approve 10 USDC", "I want to approve 5 dollars")
- "deposit" - User wants to deposit funds to vault (e.g., "deposit 10 USDC", "deposit funds")

Extract:
1. Action type: "approve" or "deposit" (must be one of these)
2. Amount in USDC (must be a number, default to 10.0 if not specified)

Important rules:
- If user says "approve" or mentions approval/allowance, action is "approve"
- If user says "deposit" or mentions depositing to vault, action is "deposit"
- If amount cannot be determined, use 10.0 as default

Respond in JSON format only:
{
  "action": "approve" | "deposit",
  "amount": <number>
}

Example responses:
- "I want to approve 10 USDC" → {"action": "approve", "amount": 10}
- "deposit 5 dollars" → {"action": "deposit", "amount": 5}
- "approve allowance" → {"action": "approve", "amount": 10}
- "I want to call the approve function" → {"action": "approve", "amount": 10}`

        console.log('[Gemini] Sending request to Gemini API...')
        result = await model.generateContent(prompt)
        console.log(`[Gemini] Successfully used model: ${modelName}`)
        break
      } catch (error){
        console.log(`[Gemini] Model ${modelName} failed:`, error.message)
        lastError = error
        continue
      }
    }
    
    if(!result){
      throw lastError || new Error('All Gemini models failed')
    }
    const response = await result.response
    const text = response.text()
    console.log('[Gemini] Raw response:', text)
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if(!jsonMatch){
      return { action: 'approve', amount: 10.0 }
    }
    
    const parsed = JSON.parse(jsonMatch[0])
    console.log('[Gemini] Parsed result:', parsed)
    
    // Validate action
    const action = (parsed.action || 'approve').toLowerCase()
    const validActions = ['approve', 'deposit']
    const finalAction = validActions.includes(action) ? action : 'approve'
    
    return {
      action: finalAction,
      amount: parsed.amount || 10.0,
    }
  } catch (error){
    console.error('[Gemini] Processing error:', error)
    console.error('[Gemini] Error details:', error.message)
    
    // Fallback: try to extract amount and action from input
    console.log('[Gemini] Using enhanced fallback extraction...')
    
    // Detect action
    const lowerInput = userInput.toLowerCase()
    let extractedAction = 'approve'
    if(lowerInput.includes('deposit')){
      extractedAction = 'deposit'
    } else if(lowerInput.includes('approve') || lowerInput.includes('approval') || lowerInput.includes('allowance')){
      extractedAction = 'approve'
    }
    
    // Extract amount - look for patterns
    const amountPatterns = [
      /(\d+\.?\d*)\s*(?:usdc|dollar|dollars|\$)/i,
      /(?:approve|deposit|send)\s*(\d+\.?\d*)/i,
      /(\d+\.?\d*)/,
    ]
    
    let extractedAmount = 10.0
    for(const pattern of amountPatterns){
      const match = userInput.match(pattern)
      if(match){
        extractedAmount = parseFloat(match[1])
        console.log('[Gemini] Extracted amount from pattern:', extractedAmount)
        break
      }
    }
    
    console.log('[Gemini] Fallback extraction result:', { 
      action: extractedAction, 
      amount: extractedAmount 
    })
    
    return {
      action: extractedAction,
      amount: extractedAmount,
    }
  }
}

/**
 * Main wallet agent function that orchestrates the wallet operation flow
 */
export async function handleWalletRequest({
  userId,
  userInput,
  inputType,
  walletContext,
}){
  try {
    console.log('='.repeat(50))
    console.log('[WALLET AGENT] Starting wallet request processing')
    console.log('[WALLET AGENT] Input type:', inputType)
    console.log('[WALLET AGENT] User ID:', userId)
    console.log('[WALLET AGENT] Wallet context:', walletContext)
    
    let processedInput = userInput
    
    // If voice input, transcribe first (userInput is base64 string)
    if(inputType === 'voice'){
      console.log('[WALLET AGENT] Processing VOICE input')
      console.log('[WALLET AGENT] Raw input (first 100 chars of base64):', userInput?.substring(0, 100))
      try {
        processedInput = await transcribeVoice(userInput)
        if(!processedInput || processedInput.trim() === ''){
          console.log('[WALLET AGENT] Transcription returned empty, using default')
          processedInput = 'Approve 10 USDC' // Default fallback
        } else {
          console.log('[WALLET AGENT] Transcription successful, proceeding with Gemini')
        }
      } catch (error){
        console.error('[WALLET AGENT] Transcription error:', error)
        processedInput = 'Approve 10 USDC' // Default fallback
      }
    } else {
      console.log('[WALLET AGENT] Processing TEXT input')
      console.log('[WALLET AGENT] Text input:', userInput)
    }
    
    console.log('[WALLET AGENT] Processed input (after transcription if voice):', processedInput)
    
    // Process with Gemini to extract action and amount
    const extracted = await processWalletRequest(processedInput, walletContext)
    
    console.log('[WALLET AGENT] Final extracted data:', extracted)
    console.log('[WALLET AGENT] Success!')
    console.log('='.repeat(50))
    
    return {
      success: true,
      action: extracted.action,
      amount: extracted.amount,
      transcribedText: inputType === 'voice' ? processedInput : null,
    }
  } catch (error){
    console.error('[WALLET AGENT] Wallet agent error:', error)
    console.error('[WALLET AGENT] Error stack:', error.stack)
    return {
      success: false,
      error: error.message,
      action: 'approve',
      amount: 0,
    }
  }
}

