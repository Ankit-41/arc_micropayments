import { GoogleGenerativeAI } from '@google/generative-ai'
import axios from 'axios'
import FormData from 'form-data'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY)

export async function transcribeVoice(audioBase64, mimeType = 'audio/webm'){
  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const formData = new FormData()
    formData.append('file', audioBuffer, { filename: 'audio.webm', contentType: mimeType })
    formData.append('model_id', 'scribe_v1')
    const response = await axios.post('https://api.elevenlabs.io/v1/speech-to-text', formData, {
      headers: { 'xi-api-key': process.env.ELEVEN_LABS_API_KEY, ...formData.getHeaders() },
    })
    return response.data.text || ''
  } catch (err){
    console.error('[Orchestrator] Transcription failed:', err?.response?.data || err.message)
    return ''
  }
}

export async function processCommand(userInput){
  // Extract one of: action: 'tip' | 'approve' | 'deposit', amount: number
  const modelNames = ['gemini-2.5-flash', 'gemini-2.5-pro']
  let lastError
  for(const modelName of modelNames){
    try {
      const model = genAI.getGenerativeModel({ model: modelName })
      const prompt = `You are an intent extraction agent for a wallet.
Parse the user's instruction and return JSON only with fields: action and amount.

Actions allowed: "tip", "approve", "deposit".
Amount: number in USDC (default to 1 if not specified).

Examples:
- "approve 10 usdc" -> {"action":"approve","amount":10}
- "deposit 3" -> {"action":"deposit","amount":3}
- "tip the creator 2 dollars" -> {"action":"tip","amount":2}

User: "${userInput}"`
      const result = await model.generateContent(prompt)
      const text = await result.response.text()
      const match = text.match(/\{[\s\S]*\}/)
      if(!match) throw new Error('No JSON in response')
      const parsed = JSON.parse(match[0])
      const action = String(parsed.action || '').toLowerCase()
      const amount = Number(parsed.amount || 1)
      if(!['tip','approve','deposit'].includes(action)) throw new Error('Invalid action')
      return { action, amount }
    } catch (e){
      lastError = e
    }
  }
  // Fallback: pattern match
  const lower = userInput.toLowerCase()
  const action = lower.includes('deposit') ? 'deposit' : lower.includes('tip') ? 'tip' : 'approve'
  const amtMatch = userInput.match(/(\d+\.?\d*)/)
  const amount = amtMatch ? Number(amtMatch[1]) : 1
  return { action, amount }
}

export async function handleOrchestrator({ userInput, inputType }){
  let processed = userInput
  if(inputType === 'voice'){
    processed = await transcribeVoice(userInput)
    if(!processed) processed = 'approve 1 usdc'
  }
  const intent = await processCommand(processed)
  return { success: true, ...intent, transcribedText: inputType === 'voice' ? processed : null }
}


