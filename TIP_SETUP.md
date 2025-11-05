# Tip Feature Setup Guide

## Overview

The tip feature allows users to send tips to creators using either text or voice input. It uses:
- **Google Gemini API** - For processing natural language tip requests
- **Eleven Labs API** - For transcribing voice input
- **Crew Agent Pattern** - For orchestrating the tip flow
- **MetaMask** - For blockchain transactions

## Environment Variables

### Agents Service (`.env` in `agents/`)

```env
GOOGLE_GEMINI_API_KEY=your_gemini_api_key_here
ELEVEN_LABS_API_KEY=your_eleven_labs_api_key_here
AGENTS_BASE_URL=http://localhost:8000
SERVER_BASE_URL=http://localhost:4000
PORT=8000
```

### Server (`.env` in `server/`)

```env
USDC_ADDRESS=your_usdc_contract_address
AGENTS_BASE_URL=http://agents:8000  # or http://localhost:8000 for local
MONGO_URI=mongodb://localhost:27017/arc_micropayments
# ... other existing vars
```

### Client (`.env` or `vite.config.js`)

```env
VITE_USDC_ADDRESS=your_usdc_contract_address
VITE_API_URL=http://localhost:4000
```

## API Keys Setup

### 1. Google Gemini API

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Add to `agents/.env` as `GOOGLE_GEMINI_API_KEY`

### 2. Eleven Labs API

1. Go to [Eleven Labs](https://elevenlabs.io/)
2. Sign up/login
3. Get your API key from the dashboard
4. Add to `agents/.env` as `ELEVEN_LABS_API_KEY`

**Note:** Eleven Labs Speech-to-Text API might require a subscription. Check their pricing.

## Installation

### Install dependencies

```bash
# In agents directory
cd agents
npm install

# Dependencies added:
# - @google/generative-ai
# - form-data
```

## How It Works

### Flow

1. **User clicks "Tip Creator"** → Modal opens
2. **User selects text or voice input**
   - **Text**: User types message (e.g., "Send 5 USDC, great article!")
   - **Voice**: User records audio message
3. **Processing with Crew Agent:**
   - If voice: Eleven Labs transcribes audio → text
   - Gemini AI extracts amount and message from input
4. **Backend creates tip record** (pending status)
5. **Frontend opens MetaMask** → User confirms transaction
6. **Backend updates tip** with transaction hash (completed status)

### Example User Inputs

**Text:**
- "Send 5 USDC"
- "Tip 2 USDC, this was really helpful!"
- "Send 10 dollars to the creator"

**Voice:**
- User speaks: "I'd like to send 3 USDC as a tip for this great post"

### Crew Agent Processing

The agent (Gemini) extracts:
- **Amount**: Number in USDC (defaults to 1.0 if not specified)
- **Message**: Optional tip message/comments

## Database Schema

### Tip Model

```javascript
{
  senderId: ObjectId (ref: User),
  creatorId: ObjectId (ref: Creator),
  postId: ObjectId (ref: Post),
  amount: Number,
  message: String,
  inputType: 'text' | 'voice',
  txHash: String,
  chainId: String,
  status: 'pending' | 'completed' | 'failed',
  errorMessage: String,
  createdAt: Date,
  updatedAt: Date
}
```

## API Endpoints

### POST `/tip/process`
Process tip request with crew agent

**Request:**
```json
{
  "postId": "...",
  "userInput": "Send 5 USDC",
  "inputType": "text", // or "voice"
  "audioData": "base64..." // if voice
}
```

**Response:**
```json
{
  "tipId": "...",
  "amount": 5,
  "message": "great article",
  "creatorWallet": "0x...",
  "senderWallet": "0x...",
  "usdcAddress": "0x...",
  "transcribedText": "..." // if voice
}
```

### POST `/tip/confirm`
Confirm tip after MetaMask transaction

**Request:**
```json
{
  "tipId": "...",
  "txHash": "0x...",
  "chainId": "1"
}
```

### GET `/tip/history?type=sent` or `?type=received`
Get tip history for user

## Testing

1. Make sure both agents and server services are running
2. Ensure user has wallet connected
3. Navigate to a post page
4. Click "💝 Tip Creator"
5. Try both text and voice inputs
6. Confirm MetaMask transaction

## Troubleshooting

### "Failed to transcribe voice input"
- Check Eleven Labs API key is valid
- Verify subscription/credits available
- Check network connection

### "Tip processing failed"
- Check Google Gemini API key
- Verify agents service is running
- Check server logs for errors

### MetaMask transaction fails
- Verify user has sufficient USDC balance
- Check USDC contract address is correct
- Ensure wallet is connected

