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
    // Fallback: return empty string, let Gemini handle it
    return ''
  }
}

/**
 * Process tip request using Gemini AI to extract amount and message
 * Acts as a crew agent that processes user input (text or transcribed voice)
 */
export async function processTipRequest(userInput, postContext = {}){
  try {
    console.log('[Gemini] Processing tip request...')
    console.log('[Gemini] Input type: TEXT')
    console.log('[Gemini] User input:', userInput)
    console.log('[Gemini] Post context:', postContext)
    
    // Try different model names - the error happens on generateContent, not model creation
     const modelNames = ['gemini-2.5-flash', 'gemini-2.5-pro']
    let result
    let lastError
    
    for(const modelName of modelNames){
      try {
        console.log(`[Gemini] Trying model: ${modelName}`)
        const model = genAI.getGenerativeModel({ model: modelName })
        
        const prompt = `You are a tip processing agent for a micropayments blogging platform. 
Extract the tip amount and message from the user's input. The user wants to send a tip to a creator.

User input: "${userInput}"

Post context:
- Title: ${postContext.title || 'N/A'}
- Category: ${postContext.category || 'N/A'}

Extract:
1. Tip amount in USDC (must be a number, default to 1.0 if not specified)
2. Optional message (user's comment about the tip)

Respond in JSON format only:
{
  "amount": <number>,
  "message": "<string or empty>"
}

If amount cannot be determined, use 1.0 as default.`

        console.log('[Gemini] Sending request to Gemini API...')
        result = await model.generateContent(prompt)
        console.log(`[Gemini] Successfully used model: ${modelName}`)
        break // Success, exit loop
      } catch (error){
        console.log(`[Gemini] Model ${modelName} failed:`, error.message)
        lastError = error
        continue // Try next model
      }
    }
    
    // If all models failed, throw error to trigger fallback
    if(!result){
      throw lastError || new Error('All Gemini models failed')
    }
    const response = await result.response
    const text = response.text()
    console.log('[Gemini] Raw response:', text)
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if(!jsonMatch){
      return { amount: 1.0, message: userInput }
    }
    
    const parsed = JSON.parse(jsonMatch[0])
    console.log('[Gemini] Parsed result:', parsed)
    return {
      amount: parsed.amount || 1.0,
      message: parsed.message || '',
    }
  } catch (error){
    console.error('[Gemini] Processing error:', error)
    console.error('[Gemini] Error details:', error.message)
    
    // Enhanced fallback: try to extract amount and message from input
    console.log('[Gemini] Using enhanced fallback extraction...')
    
    // Extract amount - look for patterns like "3 USDC", "3 usdc", "3 dollars", "send 3", etc.
    const amountPatterns = [
      /(\d+\.?\d*)\s*(?:usdc|dollar|dollars|\$)/i,
      /(?:send|tip|give)\s*(\d+\.?\d*)/i,
      /(\d+\.?\d*)/,
    ]
    
    let extractedAmount = 1.0
    for(const pattern of amountPatterns){
      const match = userInput.match(pattern)
      if(match){
        extractedAmount = parseFloat(match[1])
        console.log('[Gemini] Extracted amount from pattern:', extractedAmount)
        break
      }
    }
    
    // Extract message - remove amount-related phrases
    let extractedMessage = userInput
      .replace(/(?:send|tip|give)\s*\d+\.?\d*\s*(?:usdc|dollars?|\$)?/gi, '')
      .replace(/\d+\.?\d*\s*(?:usdc|dollars?|\$)/gi, '')
      .trim()
    
    // Clean up common phrases
    extractedMessage = extractedMessage
      .replace(/^(?:to|for|this|the)\s+(?:creator|author|writer|post|article)/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    
    if(!extractedMessage || extractedMessage.length < 3){
      extractedMessage = ''
    }
    
    console.log('[Gemini] Fallback extraction result:', { 
      amount: extractedAmount, 
      message: extractedMessage || '(no message)' 
    })
    
    return {
      amount: extractedAmount,
      message: extractedMessage,
    }
  }
}

/**
 * Main tip agent function that orchestrates the tip flow
 */
export async function handleTipRequest({
  userId,
  postId,
  creatorId,
  userInput,
  inputType,
  postContext,
}){
  try {
    console.log('='.repeat(50))
    console.log('[TIP AGENT] Starting tip request processing')
    console.log('[TIP AGENT] Input type:', inputType)
    console.log('[TIP AGENT] User ID:', userId)
    console.log('[TIP AGENT] Post ID:', postId)
    console.log('[TIP AGENT] Creator ID:', creatorId)
    console.log('[TIP AGENT] Post context:', postContext)
    
    let processedInput = userInput
    
    // If voice input, transcribe first (userInput is base64 string)
    if(inputType === 'voice'){
      console.log('[TIP AGENT] Processing VOICE input')
      console.log('[TIP AGENT] Raw input (first 100 chars of base64):', userInput?.substring(0, 100))
      try {
        processedInput = await transcribeVoice(userInput)
        // If transcription fails, use original (might be empty)
        if(!processedInput || processedInput.trim() === ''){
          console.log('[TIP AGENT] Transcription returned empty, using default')
          processedInput = 'Send 1 USDC tip' // Default fallback
        } else {
          console.log('[TIP AGENT] Transcription successful, proceeding with Gemini')
        }
      } catch (error){
        console.error('[TIP AGENT] Transcription error:', error)
        processedInput = 'Send 1 USDC tip' // Default fallback
      }
    } else {
      console.log('[TIP AGENT] Processing TEXT input')
      console.log('[TIP AGENT] Text input:', userInput)
    }
    
    console.log('[TIP AGENT] Processed input (after transcription if voice):', processedInput)
    
    // Process with Gemini to extract amount and message
    const extracted = await processTipRequest(processedInput, postContext)
    
    console.log('[TIP AGENT] Final extracted data:', extracted)
    console.log('[TIP AGENT] Success!')
    console.log('='.repeat(50))
    
    return {
      success: true,
      amount: extracted.amount,
      message: extracted.message || processedInput,
      transcribedText: inputType === 'voice' ? processedInput : null,
    }
  } catch (error){
    console.error('[TIP AGENT] Tip agent error:', error)
    console.error('[TIP AGENT] Error stack:', error.stack)
    return {
      success: false,
      error: error.message,
      amount: 0,
      message: '',
    }
  }
}

