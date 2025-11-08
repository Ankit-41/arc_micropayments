import axios from 'axios'

export async function processOrchestrator(req, res){
  try {
    const { userInput, inputType, audioData } = req.body
    if(!userInput && !audioData){
      return res.status(400).json({ error: 'userInput or audioData required' })
    }
    const agentResp = await axios.post(`${process.env.AGENTS_BASE_URL}/orchestrator/process`, {
      userInput: inputType === 'voice' ? (audioData || userInput) : (userInput || ''),
      inputType: inputType || 'text',
    })
    res.json(agentResp.data)
  } catch (err){
    console.error('processOrchestrator error:', err?.response?.data || err.message)
    res.status(500).json({ error: err.message || 'Failed to process command' })
  }
}


