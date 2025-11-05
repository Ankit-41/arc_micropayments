import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ethers } from 'ethers'
import client from '../../api/client.js'
import useToastStore from '../../store/toast.js'
import useAuthStore from '../../store/auth.js'
import { ERC20_ABI } from '../../lib/erc20.js'

const USDC = import.meta.env.VITE_USDC_ADDRESS

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

export default function TipButton({ postId, creatorId, postTitle }){
  const toast = useToastStore()
  const { user } = useAuthStore()
  const { connect } = useEthers()
  const [showTipModal, setShowTipModal] = useState(false)
  const [inputType, setInputType] = useState('text') // single-line by default
  const [textInput, setTextInput] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const MAX_RECORDING_DURATION = 30 // 30 seconds max

  const startRecording = useCallback(async () => {
    try {
      // Clear previous recording
      audioChunksRef.current = []
      setRecordingDuration(0)
      setAudioLevel(0)
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1, // Mono to reduce size
          sampleRate: 16000, // Lower sample rate to reduce size
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      
      // Set up audio analysis for waveform
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = audioContext.createAnalyser()
      const microphone = audioContext.createMediaStreamSource(stream)
      
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      microphone.connect(analyser)
      
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus', // Optimized format
      })
      
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      // Start waveform visualization
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const isRecordingRef = { current: true }
      mediaRecorderRef.current.isRecordingRef = isRecordingRef
      const updateWaveform = () => {
        if(!isRecordingRef.current || !analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length
        setAudioLevel(Math.min(average / 128, 1)) // Normalize to 0-1
        animationFrameRef.current = requestAnimationFrame(updateWaveform)
      }
      updateWaveform()

      mediaRecorder.ondataavailable = (event) => {
        if(event.data.size > 0){
          audioChunksRef.current.push(event.data)
          console.log('[TipButton] Audio chunk received:', event.data.size, 'bytes')
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        console.log('[TipButton] Recording stopped. Total size:', audioBlob.size, 'bytes')
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
        // Stop waveform animation
        if(mediaRecorderRef.current?.isRecordingRef){
          mediaRecorderRef.current.isRecordingRef.current = false
        }
        // Clean up audio context
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

      mediaRecorder.start(1000) // Collect data every second
      setIsRecording(true)
      
      // Start duration timer
      const startTime = Date.now()
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        setRecordingDuration(elapsed)
        
        // Auto-stop at max duration
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
      // Stop waveform animation
      if(mediaRecorderRef.current.isRecordingRef){
        mediaRecorderRef.current.isRecordingRef.current = false
      }
      mediaRecorderRef.current.stop()
      // Try to stop tracks if available
      try {
        if(mediaRecorderRef.current.stream){
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
        }
      } catch (e){
        // Stream might already be stopped
      }
      setIsRecording(false)
      
      // Clean up audio context
      if(audioContextRef.current){
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      if(animationFrameRef.current){
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      setAudioLevel(0)
      
      // Clear timer
      if(recordingTimerRef.current){
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    }
  }, [])

  const handleTip = useCallback(async () => {
    if(!user){
      toast.push('Sign in to send tips', 'warning')
      return
    }

    if(!textInput.trim() && inputType === 'text'){
      toast.push('Please enter a tip message or amount', 'warning')
      return
    }

    setIsProcessing(true)
    try {
      // Ensure wallet is connected
      await connect()

      // Prepare request data
      let requestData = {
        postId,
        userInput: textInput.trim() || 'Send 1 USDC tip',
        inputType: 'text',
      }

      // If voice input, convert audio to base64
      if(inputType === 'voice'){
        // Stop recording if still recording
        if(isRecording){
          stopRecording()
          // Wait a moment for the recording to finish
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        
        if(audioChunksRef.current.length === 0){
          toast.push('No audio recorded. Please record your voice message first.', 'warning')
          setIsProcessing(false)
          return
        }
        
        console.log('[TipButton] Converting audio to base64...')
        console.log('[TipButton] Audio chunks:', audioChunksRef.current.length)
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        console.log('[TipButton] Audio blob size:', audioBlob.size, 'bytes')
        
        const reader = new FileReader()
        const audioBase64 = await new Promise((resolve, reject) => {
          reader.onloadend = () => {
            const base64 = reader.result.split(',')[1]
            console.log('[TipButton] Base64 length:', base64.length, 'chars')
            resolve(base64)
          }
          reader.onerror = reject
          reader.readAsDataURL(audioBlob)
        })
        requestData.userInput = audioBase64
        requestData.inputType = 'voice'
        requestData.audioData = audioBase64
        console.log('[TipButton] Voice data prepared, sending to backend...')
      }

      // Process tip with crew agent
      let processResp
      try {
        processResp = await client.post('/tip/process', requestData)
      } catch (processError){
        // Check if insufficient allowance - need to approve first
        if(processError.response?.data?.error === 'insufficient approved allowance'){
          const { requiredAmount, availableAllowance } = processError.response.data
          const needed = (requiredAmount - availableAllowance).toFixed(2)
          
          toast.push(`Insufficient approved allowance. Need to approve ${needed} USDC first.`, 'warning')
          
          // Navigate to wallet page for approval
          setTimeout(() => {
            window.location.href = '/wallet'
          }, 1500)
          setIsProcessing(false)
          return
        }
        throw processError
      }
      
      const { tipId, amount, message, creatorWallet, senderWallet, usdcAddress, transcribedText } = processResp.data

      // Show transcribed text if voice
      if(transcribedText){
        toast.push(`Transcribed: "${transcribedText}"`, 'info')
      }

      // Allowance check is already done on backend, but double-check before sending transaction
      const walletSummaryResp = await client.get('/wallet/summary')
      const availableAllowance = walletSummaryResp.data.summary?.availableAllowance || 0
      
      if(amount > availableAllowance){
        // Need to approve first
        const needed = (amount - availableAllowance).toFixed(2)
        toast.push(`Insufficient allowance (${availableAllowance.toFixed(2)} USDC available). Need ${needed} more USDC. Redirecting to wallet...`, 'warning')
        
        // Store tip data for after approval
        sessionStorage.setItem('pendingTip', JSON.stringify({
          tipId,
          amount,
          message,
          creatorWallet,
          usdcAddress,
        }))
        
        // Navigate to wallet
        setTimeout(() => {
          window.location.href = '/wallet'
        }, 1500)
        setIsProcessing(false)
        return
      }

      // Open MetaMask to send transaction
      if(!window.ethereum){
        throw new Error('MetaMask not found')
      }

      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const erc20 = new ethers.Contract(usdcAddress, ERC20_ABI, signer)
      
      // Get decimals
      const decimals = await erc20.decimals()
      const amountInWei = ethers.parseUnits(amount.toString(), decimals)

      toast.push(`Sending ${amount} USDC to creator...`, 'info')

      // Send transaction
      const tx = await erc20.transfer(creatorWallet, amountInWei)
      const receipt = await tx.wait()

      // Confirm tip on backend
      await client.post('/tip/confirm', {
        tipId,
        txHash: receipt.hash,
        chainId: tx.chainId?.toString(),
      })

      toast.push(`Tip of ${amount} USDC sent successfully! ${message ? `"${message}"` : ''}`, 'success')
      setShowTipModal(false)
      setTextInput('')
      audioChunksRef.current = []
    } catch (error){
      console.error('Tip error:', error)
      if(error.code === 4001){
        toast.push('Transaction rejected by user', 'warning')
      } else {
        toast.push(error.message || 'Failed to send tip', 'danger')
      }
    } finally {
      setIsProcessing(false)
    }
  }, [user, postId, textInput, inputType, connect, toast])

  // Cleanup on unmount
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
            className="w-1 bg-red-500 rounded-full transition-all duration-100"
            style={{ height: `${height * 100}%` }}
          />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border-2 border-purple-500/50 bg-gradient-to-r from-slate-900/90 to-slate-800/90 px-4 py-3 shadow-lg">
        <div className="flex-1">
          <input
            type="text"
            value={textInput}
            onChange={(e) => {
              setTextInput(e.target.value)
              setInputType('text')
            }}
            placeholder="Enter tip amount & message (e.g., 'Tip 2 USDC – thanks!')"
            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <button
          type="button"
          title={isRecording ? 'Stop recording' : 'Record voice tip'}
          onClick={() => {
            setInputType('voice')
            if(!isRecording) startRecording(); else stopRecording()
          }}
          className={`relative flex items-center justify-center h-10 w-10 rounded-lg transition-all ${
            isRecording 
              ? 'bg-red-600 text-white shadow-lg shadow-red-600/50 scale-110' 
              : 'bg-purple-600 text-white hover:bg-purple-500 hover:scale-105'
          }`}
        >
          <svg 
            className="w-5 h-5" 
            fill="currentColor" 
            viewBox="0 0 20 20"
          >
            <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4z" />
            <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.314 2.686 6 6 6s6-2.686 6-6v-.357a.75.75 0 00-1.5 0V10c0 2.486-2.014 4.5-4.5 4.5S5.5 12.486 5.5 10v-.357z" />
          </svg>
          {isRecording && (
            <span className="pointer-events-none absolute inset-0 animate-ping rounded-lg bg-red-400/40" />
          )}
        </button>
        <button
          type="button"
          disabled={isProcessing || (inputType === 'voice' && audioChunksRef.current.length === 0 && !isRecording)}
          onClick={handleTip}
          className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-60 transition-all hover:scale-105"
        >
          {isProcessing ? 'Sending...' : 'Send Tip'}
        </button>
      </div>
      {isRecording && (
        <div className="mt-2 flex items-center gap-3 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2">
          <Waveform isActive={isRecording} level={audioLevel} />
          <span className="text-xs font-medium text-red-300">
            Recording… {recordingDuration}s
          </span>
          <button
            type="button"
            onClick={stopRecording}
            className="ml-auto text-xs text-red-300 hover:text-red-200 underline"
          >
            Stop
          </button>
        </div>
      )}
    </>
  )
}

