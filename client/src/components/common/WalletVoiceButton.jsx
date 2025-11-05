import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ethers } from 'ethers'
import client from '../../api/client.js'
import useToastStore from '../../store/toast.js'
import useAuthStore from '../../store/auth.js'
import { ERC20_ABI } from '../../lib/erc20.js'

const USDC = import.meta.env.VITE_USDC_ADDRESS
const VAULT = import.meta.env.VITE_VAULT_ADDRESS

const VAULT_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

function useEthers(){
  const [signer, setSigner] = useState(null)
  const [account, setAccount] = useState('')

  const connect = async () => {
    if(!window.ethereum) throw new Error('Install MetaMask')
    const provider = new ethers.BrowserProvider(window.ethereum)
    await provider.send('eth_requestAccounts', [])
    const nextSigner = await provider.getSigner()
    const addr = await nextSigner.getAddress()
    setSigner(nextSigner)
    setAccount(addr)
    return { signer: nextSigner, address: addr }
  }

  return { account, connect }
}

// Waveform component
function Waveform({ isActive, level }){
  const [heights, setHeights] = useState(() => Array(12).fill(0.2))
  
  useEffect(() => {
    if(!isActive) {
      setHeights(Array(12).fill(0.2))
      return
    }
    
    const interval = setInterval(() => {
      setHeights(prev => {
        const baseVariation = level * 0.8
        return prev.map((_, i) => {
          const phase = (Date.now() / 150 + i * 0.3) % (Math.PI * 2)
          const wave = Math.sin(phase) * baseVariation
          const random = (Math.random() - 0.5) * baseVariation * 0.3
          return Math.max(0.15, Math.min(0.95, 0.3 + wave + random))
        })
      })
    }, 100)
    
    return () => clearInterval(interval)
  }, [isActive, level])
  
  return (
    <div className="flex items-end gap-0.5 h-6">
      {heights.map((height, i) => (
        <div
          key={i}
          className="w-1 bg-emerald-500 rounded-full transition-all duration-100"
          style={{ height: `${height * 100}%` }}
        />
      ))}
    </div>
  )
}

export default function WalletVoiceButton({ data, refresh }){
  const toast = useToastStore()
  const { user } = useAuthStore()
  const { connect } = useEthers()
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [transcribedText, setTranscribedText] = useState('')
  const [confirmedAction, setConfirmedAction] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const MAX_RECORDING_DURATION = 30

  const startRecording = useCallback(async () => {
    try {
      audioChunksRef.current = []
      setRecordingDuration(0)
      setAudioLevel(0)
      setTranscribedText('')
      setConfirmedAction(null)
      setShowConfirm(false)
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = audioContext.createAnalyser()
      const microphone = audioContext.createMediaStreamSource(stream)
      
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      microphone.connect(analyser)
      
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      })
      
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const isRecordingRef = { current: true }
      mediaRecorderRef.current.isRecordingRef = isRecordingRef
      const updateWaveform = () => {
        if(!isRecordingRef.current || !analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length
        setAudioLevel(Math.min(average / 128, 1))
        animationFrameRef.current = requestAnimationFrame(updateWaveform)
      }
      updateWaveform()
      
      mediaRecorder.ondataavailable = (event) => {
        if(event.data.size > 0){
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
        if(mediaRecorderRef.current?.isRecordingRef){
          mediaRecorderRef.current.isRecordingRef.current = false
        }
        if(audioContextRef.current){
          audioContextRef.current.close()
          audioContextRef.current = null
        }
        if(animationFrameRef.current){
          cancelAnimationFrame(animationFrameRef.current)
          animationFrameRef.current = null
        }
        setAudioLevel(0)
      }

      mediaRecorder.start(1000)
      setIsRecording(true)
      
      const startTime = Date.now()
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        setRecordingDuration(elapsed)
        
        if(elapsed >= MAX_RECORDING_DURATION){
          if(mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive'){
            if(mediaRecorderRef.current.isRecordingRef){
              mediaRecorderRef.current.isRecordingRef.current = false
            }
            mediaRecorderRef.current.stop()
            stream.getTracks().forEach(track => track.stop())
          }
          setIsRecording(false)
          if(recordingTimerRef.current){
            clearInterval(recordingTimerRef.current)
            recordingTimerRef.current = null
          }
          if(animationFrameRef.current){
            cancelAnimationFrame(animationFrameRef.current)
            animationFrameRef.current = null
          }
          if(audioContextRef.current){
            audioContextRef.current.close()
            audioContextRef.current = null
          }
          setAudioLevel(0)
          toast.push(`Recording stopped at ${MAX_RECORDING_DURATION} seconds (maximum)`, 'info')
        }
      }, 1000)
    } catch (error){
      console.error('Error starting recording:', error)
      toast.push('Could not access microphone', 'danger')
    }
  }, [toast])

  const stopRecording = useCallback(() => {
    if(mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive'){
      if(mediaRecorderRef.current.isRecordingRef){
        mediaRecorderRef.current.isRecordingRef.current = false
      }
      mediaRecorderRef.current.stop()
      try {
        if(mediaRecorderRef.current.stream){
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
        }
      } catch (e){}
      setIsRecording(false)
      
      if(audioContextRef.current){
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      if(animationFrameRef.current){
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      setAudioLevel(0)
      
      if(recordingTimerRef.current){
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    }
  }, [])

  const processVoiceCommand = useCallback(async () => {
    if(audioChunksRef.current.length === 0){
      toast.push('No audio recorded. Please record your voice command first.', 'warning')
      return
    }

    setIsProcessing(true)
    try {
      await connect()

      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const reader = new FileReader()
      const audioBase64 = await new Promise((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1]
          resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(audioBlob)
      })

      const processResp = await client.post('/wallet/process', {
        userInput: audioBase64,
        inputType: 'voice',
        audioData: audioBase64,
      })

      const { action, amount, transcribedText } = processResp.data
      setTranscribedText(transcribedText || '')
      setConfirmedAction({ action, amount })
      setShowConfirm(true)
      toast.push(`Interpreted: ${action} ${amount} USDC`, 'info')
    } catch (error){
      console.error('Voice processing error:', error)
      toast.push(error.response?.data?.error || 'Failed to process voice command', 'danger')
    } finally {
      setIsProcessing(false)
    }
  }, [connect, toast])

  const executeAction = useCallback(async () => {
    if(!confirmedAction) return
    
    setIsProcessing(true)
    try {
      if(!window.ethereum) throw new Error('Install MetaMask')
      
      // Get provider and signer separately
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      if(!signer) throw new Error('Wallet connection failed')
      
      // Use provider for read operations, signer for write operations
      const ercRead = new ethers.Contract(USDC, ERC20_ABI, provider)
      const erc = new ethers.Contract(USDC, ERC20_ABI, signer)
      const vault = new ethers.Contract(VAULT, VAULT_ABI, signer)
      
      const { action, amount } = confirmedAction
      
      // Get decimals and symbol from contract using provider (read-only)
      let decimals = 6 // Default for USDC
      let symbol = 'USDC' // Default
      try {
        decimals = Number(await ercRead.decimals())
        symbol = await ercRead.symbol()
      } catch (err){
        console.warn('Failed to get token info, using defaults:', err)
      }
      
      const amt = ethers.parseUnits(amount.toString(), decimals)

      if(action === 'approve'){
        // Get last approved amount and deposit it to vault before requesting new approval
        const lastApproval = data.approvals?.[0]
        if(lastApproval && lastApproval.amount > 0){
          try {
            const lastApprovalAmount = lastApproval.amount
            toast.push(`Depositing ${lastApprovalAmount.toFixed(2)} ${symbol} from previous approval to vault...`, 'info')
            
            const userAddress = await signer.getAddress()
            const balanceOf = await erc.balanceOf(userAddress)
            const depositAmount = ethers.parseUnits(lastApprovalAmount.toString(), decimals)
            
            if(balanceOf >= depositAmount){
              const depositTx = await vault.deposit(depositAmount)
              const depositReceipt = await depositTx.wait()
              await client.post('/wallet/deposit', { 
                amount: lastApprovalAmount, 
                txHash: depositReceipt.hash, 
                chainId: depositTx.chainId?.toString?.() 
              })
              toast.push(`${lastApprovalAmount.toFixed(2)} ${symbol} deposited to vault`, 'success')
            } else {
              toast.push(`Insufficient balance to deposit ${lastApprovalAmount.toFixed(2)} ${symbol}. Proceeding with approval only.`, 'warning')
            }
          } catch (depositErr){
            console.warn('Deposit of previous approval failed:', depositErr)
            toast.push('Could not deposit previous approval amount. Proceeding with approval...', 'warning')
          }
        }
        
        const tx = await erc.approve(VAULT, amt)
        const receipt = await tx.wait()
        await client.post('/wallet/approve', { amount: Number(amount), txHash: receipt.hash, chainId: tx.chainId?.toString?.() })
        toast.push(`Allowance of ${amount} ${symbol} approved successfully`, 'success')
        await refresh()
      } else if(action === 'deposit'){
        // Check if enough approval exists
        const summaryResp = await client.get('/wallet/summary')
        const availableAllowance = summaryResp.data.summary?.availableAllowance || 0
        
        if(amount > availableAllowance){
          toast.push(`Insufficient approval. You have ${availableAllowance.toFixed(2)} ${symbol} approved, but need ${amount.toFixed(2)}. Please approve first.`, 'warning')
          setIsProcessing(false)
          return
        }
        
        const tx = await vault.deposit(amt)
        const receipt = await tx.wait()
        await client.post('/wallet/deposit', { amount: Number(amount), txHash: receipt.hash, chainId: tx.chainId?.toString?.() })
        toast.push(`Funds of ${amount} ${symbol} deposited into the vault`, 'success')
        await refresh()
      }
      
      setShowConfirm(false)
      setConfirmedAction(null)
      setTranscribedText('')
      audioChunksRef.current = []
    } catch (error){
      console.error('Action execution error:', error)
      if(error.code === 4001){
        toast.push('Transaction rejected by user', 'warning')
      } else {
        toast.push(error.message || 'Action failed', 'danger')
      }
    } finally {
      setIsProcessing(false)
    }
  }, [confirmedAction, connect, toast, data, refresh])

  useEffect(() => {
    return () => {
      stopRecording()
      if(recordingTimerRef.current){
        clearInterval(recordingTimerRef.current)
      }
      if(animationFrameRef.current){
        cancelAnimationFrame(animationFrameRef.current)
      }
      if(audioContextRef.current){
        audioContextRef.current.close()
      }
    }
  }, [stopRecording])

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="text-sm text-slate-300">
          Approve or deposit by speaking natural language
        </div>
        <button
          type="button"
          title={isRecording ? 'Stop recording' : 'Record voice command'}
          onClick={() => {
            if(!isRecording) {
              startRecording()
            } else {
              stopRecording()
              if(audioChunksRef.current.length > 0){
                processVoiceCommand()
              }
            }
          }}
          disabled={isProcessing}
          className={`relative grid place-items-center h-16 w-16 rounded-full transition-all ${
            isRecording 
              ? 'bg-red-600 text-white shadow-lg shadow-red-600/50 scale-105' 
              : 'bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-105'
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <svg 
            className="w-7 h-7" 
            fill="currentColor" 
            viewBox="0 0 20 20"
          >
            <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4z" />
            <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.314 2.686 6 6 6s6-2.686 6-6v-.357a.75.75 0 00-1.5 0V10c0 2.486-2.014 4.5-4.5 4.5S5.5 12.486 5.5 10v-.357z" />
          </svg>
          {isRecording && (
            <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-red-400/40" />
          )}
        </button>
        {isRecording && (
          <div className="mt-1 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
            <Waveform isActive={isRecording} level={audioLevel} />
            <span className="text-xs font-medium text-red-300">
              {recordingDuration}s
            </span>
          </div>
        )}
        {showConfirm && confirmedAction && (
          <div className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2 text-left">
            <div className="text-xs text-emerald-200">
              <div className="font-semibold mb-1">Transcribed:</div>
              <div className="text-emerald-300/80">{transcribedText || 'No transcription'}</div>
            </div>
            <div className="text-xs text-emerald-200">
              <div className="font-semibold mb-1">Action:</div>
              <div className="text-emerald-300/80 capitalize">{confirmedAction.action} {confirmedAction.amount} USDC</div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={executeAction}
                disabled={isProcessing}
                className="flex-1 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isProcessing ? 'Processing...' : 'Confirm & Execute'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false)
                  setConfirmedAction(null)
                  setTranscribedText('')
                  audioChunksRef.current = []
                }}
                disabled={isProcessing}
                className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

