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

function useEthers() {
  const [signer, setSigner] = useState(null)
  const [account, setAccount] = useState('')

  const connect = async () => {
    if (!window.ethereum) throw new Error('Install MetaMask')
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
function Waveform({ isActive, level }) {
  const [heights, setHeights] = useState(() => Array(12).fill(0.2))

  useEffect(() => {
    if (!isActive) {
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

export default function WalletVoiceButton({ data, refresh }) {
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
  const [workflow, setWorkflow] = useState([]) // [{key,label,status}]
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const MAX_RECORDING_DURATION = 30

  // ---------- Small helpers ----------
  const setStepStatus = useCallback((key, status) => {
    setWorkflow(prev => prev.map(s => s.key === key ? { ...s, status } : s))
  }, [])

  const asNumber = (v) => {
    const n = Number.parseFloat(v ?? '0')
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  const getSummary = async () => {
    try {
      const s = await client.get('/wallet/summary')
      return s.data?.summary || s.data || {}
    } catch (err) {
      // If 404, user might not exist in DB yet - return empty summary
      if (err.response?.status === 404) {
        console.warn('Wallet summary not found - user may not be initialized')
        return { availableAllowance: 0, approvedTotal: 0, usedTotal: 0, depositedTotal: 0 }
      }
      throw err // Re-throw other errors
    }
  }

  // ---------- Recording ----------
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
        if (!isRecordingRef.current || !analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length
        setAudioLevel(Math.min(average / 128, 1))
        animationFrameRef.current = requestAnimationFrame(updateWaveform)
      }
      updateWaveform()

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
        if (mediaRecorderRef.current?.isRecordingRef) {
          mediaRecorderRef.current.isRecordingRef.current = false
        }
        if (audioContextRef.current) {
          audioContextRef.current.close()
          audioContextRef.current = null
        }
        if (animationFrameRef.current) {
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

        if (elapsed >= MAX_RECORDING_DURATION) {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            if (mediaRecorderRef.current.isRecordingRef) {
              mediaRecorderRef.current.isRecordingRef.current = false
            }
            mediaRecorderRef.current.stop()
            stream.getTracks().forEach(track => track.stop())
          }
          setIsRecording(false)
          if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current)
            recordingTimerRef.current = null
          }
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
            animationFrameRef.current = null
          }
          if (audioContextRef.current) {
            audioContextRef.current.close()
            audioContextRef.current = null
          }
          setAudioLevel(0)
          toast.push(`Recording stopped at ${MAX_RECORDING_DURATION} seconds (maximum)`, 'info')

          // Auto-process if we actually captured audio
          if (audioChunksRef.current.length > 0) {
            // no await to avoid blocking UI; we still set processing inside
            processVoiceCommand()
          }
        }
      }, 1000)
    } catch (error) {
      console.error('Error starting recording:', error)
      toast.push('Could not access microphone', 'danger')
    }
  }, [toast])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (mediaRecorderRef.current.isRecordingRef) {
        mediaRecorderRef.current.isRecordingRef.current = false
      }
      mediaRecorderRef.current.stop()
      try {
        if (mediaRecorderRef.current.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
        }
      } catch (e) { }
      setIsRecording(false)

      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      setAudioLevel(0)

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    }
  }, [])

  const processVoiceCommand = useCallback(async () => {
    if (audioChunksRef.current.length === 0) {
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

      const processResp = await client.post('/orchestrator/process', {
        userInput: audioBase64,
        inputType: 'voice',
        audioData: audioBase64,
      })

      const { action, amount, transcribedText } = processResp.data
      setTranscribedText(transcribedText || '')
      setConfirmedAction({ action, amount })
      setWorkflow(planWorkflow(action, amount))
      setShowConfirm(true)
      toast.push(`Interpreted: ${action} ${amount} USDC`, 'info')
    } catch (error) {
      console.error('Voice processing error:', error)
      toast.push(error.response?.data?.error || 'Failed to process voice command', 'danger')
    } finally {
      setIsProcessing(false)
    }
  }, [connect, toast])

  const approveFlow = useCallback(async ({
    signer,
    provider,
    ercRead,
    erc,
    vault,
    symbol,
    decimals,
    targetAmount, // number
  }) => {
    const amountNum = asNumber(targetAmount)
    if (amountNum <= 0) throw new Error('Invalid approval amount')

    // (Optional) Try to deposit any previous approval exactly once.
    // If it fails (e.g., insufficient allowance/balance), skip with a warning.
    let lastApproval = data?.approvals?.[0]
    if (!lastApproval) {
      try {
        const s = await client.get('/wallet/summary')
        lastApproval = s.data?.approvals?.[0]
      } catch { /* noop */ }
    }

    if (lastApproval && asNumber(lastApproval.amount) > 0) {
      const lastAmtNum = asNumber(lastApproval.amount)
      const lastAmtWei = ethers.parseUnits(lastAmtNum.toString(), decimals)
      console.log("lauda sala ", lastAmtWei);
      try {
        setStepStatus('depositPrev', 'running')
        const depTx = await vault.deposit(lastAmtWei) // will succeed only if allowance is enough
        const depRcpt = await depTx.wait()
        await client.post('/wallet/deposit', {
          amount: lastAmtNum,
          txHash: depRcpt.hash,
          chainId: depTx.chainId?.toString?.()
        })
        toast.push(`The last approved amount of ${lastAmtNum.toFixed(2)} ${symbol} deposited to vault`, 'success')
        setStepStatus('depositPrev', 'done')
      } catch (e) {
        console.warn('Previous-approval deposit skipped:', e)
        toast.push('Could not deposit previous approved amount (skipping).', 'warning')
        setStepStatus('depositPrev', 'skipped')
      }
    } else {
      setStepStatus('depositPrev', 'skipped')
    }
    toast.push(`Will now start approving amount equal to tip`, 'info')
    setStepStatus('approve', 'running')
    const amtWei = ethers.parseUnits(amountNum.toString(), decimals)
    const tx = await erc.approve(VAULT, amtWei)
    const rcpt = await tx.wait()
    await client.post('/wallet/approve', {
      amount: amountNum,
      txHash: rcpt.hash,
      chainId: tx.chainId?.toString?.()
    })
    toast.push(`Allowance of ${amountNum} ${symbol} approved successfully`, 'success')
    if (refresh) await refresh()
    setStepStatus('approve', 'done')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, refresh, toast, setStepStatus])

  const depositFlow = useCallback(async ({
    signer,
    provider,
    ercRead,
    erc,
    vault,
    symbol,
    decimals,
    targetAmount, // number
  }) => {
    const amountNum = asNumber(targetAmount)
    if (amountNum <= 0) throw new Error('Invalid deposit amount')

    const summary = await getSummary()
    const availableAllowance = asNumber(summary.availableAllowance)
    const user = await signer.getAddress()
    const balanceNum = Number(ethers.formatUnits(await erc.balanceOf(user), decimals))

    // If no/low allowance, approve once (no recursion)
    if (availableAllowance < amountNum) {
      toast.push(`Approving ${(amountNum ).toFixed(2)} ${symbol} to enable deposit…`, 'info')
      await approveFlow({ signer, provider, ercRead, erc, vault, symbol, decimals, targetAmount: amountNum })
    }

    // Wallet balance check
    if (balanceNum < amountNum) {
      setStepStatus('deposit', 'error')
      throw new Error(`Insufficient wallet balance. Need ${amountNum.toFixed(2)} ${symbol}, have ${balanceNum.toFixed(2)}.`)
    }

    // Do the deposit
    setStepStatus('deposit', 'running')
    const amtWei = ethers.parseUnits(amountNum.toString(), decimals)
    const tx = await vault.deposit(amtWei)
    const rcpt = await tx.wait()
    await client.post('/wallet/deposit', {
      amount: amountNum,
      txHash: rcpt.hash,
      chainId: tx.chainId?.toString?.()
    })
    toast.push(`Funds of ${amountNum} ${symbol} deposited into the vault`, 'success')
    if (refresh) await refresh()
    setStepStatus('deposit', 'done')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveFlow, refresh, toast, setStepStatus])

  // --- REPLACE your tipFlow with this version ---
  const tipFlow = useCallback(async ({
    signer,
    provider,
    symbol,
    decimals,
    amount, // number
  }) => {
    const amountNum = asNumber(amount)
    if (amountNum <= 0) throw new Error('Invalid tip amount')

    // 1) Ensure allowance once - tipping only needs approval, NOT deposit to vault
    const summary1 = await getSummary()
    const availableAllowance1 = asNumber(summary1.availableAllowance)
    if (availableAllowance1 < amountNum) {
      toast.push(`Approval required to enable tipping…`, 'info')
      setStepStatus('approveIfNeeded', 'running')
      const ercRead = new ethers.Contract(USDC, ERC20_ABI, provider)
      const erc = new ethers.Contract(USDC, ERC20_ABI, signer)
      const vault = new ethers.Contract(VAULT, VAULT_ABI, signer)
      await approveFlow({ signer, provider, ercRead, erc, vault, symbol, decimals, targetAmount: amountNum })
      setStepStatus('approveIfNeeded', 'done')
    } else {
      setStepStatus('approveIfNeeded', 'skipped')
    }

    // 3) Perform the tip as before
    const pendingTipStr = sessionStorage.getItem('pendingTip')
    const path = window.location.pathname || ''
    const onPostPage = /^\/p\//.test(path)

    const sendTipTransfer = async ({ amountToSend, to, usdcAddress, tipId }) => {
      if (!to) {
        throw new Error('Creator wallet address is required')
      }
      console.log('[Tip] Transferring', amountToSend, 'USDC to creator wallet:', to)
      const erc20 = new ethers.Contract(usdcAddress || USDC, ERC20_ABI, signer)
      const d = await erc20.decimals()
      const wei = ethers.parseUnits(amountToSend.toString(), d)
      const userAddr = await signer.getAddress()
      console.log('[Tip] User wallet:', userAddr, 'Creator wallet:', to)
      if (userAddr.toLowerCase() === to.toLowerCase()) {
        throw new Error('Cannot send tip to your own wallet address')
      }
      toast.push(`Sending ${amountToSend} ${symbol} to creator at ${to.slice(0, 6)}...${to.slice(-4)}…`, 'info')
      setStepStatus('sendTip', 'running')
      const tipTx = await erc20.transfer(to, wei)
      const tipReceipt = await tipTx.wait()
      console.log('[Tip] Transfer successful, tx:', tipReceipt.hash)
      await client.post('/tip/confirm', {
        tipId,
        txHash: tipReceipt.hash,
        chainId: tipTx.chainId?.toString?.()
      })
      toast.push(`Tip of ${amountToSend} ${symbol} sent successfully to creator!`, 'success')
      if (refresh) await refresh()
      setStepStatus('sendTip', 'done')
    }

    if (pendingTipStr) {
      const pendingTip = JSON.parse(pendingTipStr)
      await sendTipTransfer({
        amountToSend: asNumber(pendingTip.amount),
        to: pendingTip.creatorWallet,
        usdcAddress: USDC,
        tipId: pendingTip.tipId
      })
      sessionStorage.removeItem('pendingTip')
      return
    }

    if (onPostPage) {
      const slug = path.split('/p/')[1]
      try {
        const postResp = await client.get(`/posts/${slug}`)
        const post = postResp.data.post
        if (!post?._id || !post.creatorId) {
          toast.push('Could not load post context for tipping', 'danger')
          setStepStatus('sendTip', 'error')
          return
        }

        let tipResp
        try {
          tipResp = await client.post('/tip/process', {
            postId: post._id,
            userInput: `Send ${amountNum} USDC tip`,
            inputType: 'text',
          })
        } catch (processErr) {
          throw processErr
        }
        console.log("post id",post._id);

        const { tipId, amount: finalAmt, creatorWallet, usdcAddress, transcribedText } = tipResp.data
        if (transcribedText) {
          toast.push(`Transcribed: "${transcribedText}"`, 'info')
        }
        
        if (!creatorWallet) {
          throw new Error('Creator wallet address not found in response')
        }
        console.log('[Tip] Backend returned creator wallet:', creatorWallet)

        await sendTipTransfer({
          amountToSend: asNumber(finalAmt),
          to: creatorWallet,
          usdcAddress,
          tipId
        })
      } catch (e) {
        console.error('Tip on post failed:', e)
        toast.push(e.response?.data?.error || 'Failed to process tip', 'danger')
        setStepStatus('sendTip', 'error')
      }
      return
    }

    toast.push('Open a post to send the tip.', 'warning')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveFlow, refresh, toast, setStepStatus])

  // ---------- Main executor ----------
  const planWorkflow = useCallback((action, amount) => {
    const amt = Number(amount || 0).toFixed(2)
    if (action === 'approve') {
      return [
        { key: 'depositPrev', label: 'Deposit previous approval (if any)', status: 'pending' },
        { key: 'approve', label: `Approve ${amt} USDC`, status: 'pending' },
      ]
    }
    if (action === 'deposit') {
      return [
        { key: 'deposit', label: `Deposit ${amt} USDC to vault`, status: 'pending' },
      ]
    }
    if (action === 'tip') {
      return [
        { key: 'approveIfNeeded', label: 'Approve missing allowance (if needed)', status: 'pending' },
        { key: 'sendTip', label: `Send tip ${amt} USDC to creator`, status: 'pending' },
      ]
    }
    return []
  }, [])

  const executeAction = useCallback(async () => {
    if (!confirmedAction) return

    setIsProcessing(true)
    try {
      if (!window.ethereum) throw new Error('Install MetaMask')
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      if (!signer) throw new Error('Wallet connection failed')

      const ercRead = new ethers.Contract(USDC, ERC20_ABI, provider)
      const erc = new ethers.Contract(USDC, ERC20_ABI, signer)
      const vault = new ethers.Contract(VAULT, VAULT_ABI, signer)

      // Token metadata (safe defaults)
      let decimals = 6
      let symbol = 'USDC'
      try {
        decimals = Number(await ercRead.decimals())
        symbol = await ercRead.symbol()
      } catch (err) {
        console.warn('Failed to get token info, using defaults:', err)
      }

      const { action } = confirmedAction
      const amountNum = asNumber(confirmedAction.amount)

      if (action === 'approve') {
        await approveFlow({ signer, provider, ercRead, erc, vault, symbol, decimals, targetAmount: amountNum })
      } else if (action === 'deposit') {
        await depositFlow({ signer, provider, ercRead, erc, vault, symbol, decimals, targetAmount: amountNum })
      } else if (action === 'tip') {
        await tipFlow({ signer, provider, symbol, decimals, amount: amountNum })
      }

      setShowConfirm(false)
      setConfirmedAction(null)
      setTranscribedText('')
      audioChunksRef.current = []
    } catch (error) {
      console.error('Action execution error:', error)
      if (error.code === 4001) {
        toast.push('Transaction rejected by user', 'warning')
      } else {
        toast.push(error.message || 'Action failed', 'danger')
      }
    } finally {
      setIsProcessing(false)
    }
  }, [confirmedAction, approveFlow, depositFlow, tipFlow, toast])

  // ---------- Cleanup ----------
  useEffect(() => {
    return () => {
      stopRecording()
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [stopRecording])

  const hasWorkflow = workflow.length > 0

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className={`flex transition-all duration-500 ease-in-out ${hasWorkflow ? 'flex-row items-start gap-4' : 'flex-col items-center gap-3'
        }`}>
        <div className={`flex flex-col items-center gap-3 transition-all duration-500 ease-in-out ${hasWorkflow ? 'flex-shrink-0' : 'w-full'
          }`}>
          {!hasWorkflow && (
            <div className="text-sm text-slate-300 text-center">
            Tip or approve or deposit by speaking in natural language
            </div>
          )}
          <button
            type="button"
            title={isRecording ? 'Stop recording' : 'Record voice command'}
            onClick={() => {
              if (!isRecording) {
                startRecording()
              } else {
                stopRecording()
                if (audioChunksRef.current.length > 0) {
                  processVoiceCommand()
                }
              }
            }}
            disabled={isProcessing}
            className={`relative grid place-items-center h-16 w-16 rounded-full transition-all duration-300 ${isRecording
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/50 scale-105'
                : 'bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-105'
              } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4z" />
              <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.314 2.686 6 6 6s6-2.686 6-6v-.357a.75.75 0 00-1.5 0V10c0 2.486-2.014 4.5-4.5 4.5S5.5 12.486 5.5 10v-.357z" />
            </svg>
            {isRecording && (
              <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-red-400/40" />
            )}
          </button>
          {isRecording && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
              <Waveform isActive={isRecording} level={audioLevel} />
              <span className="text-xs font-medium text-red-300">
                {recordingDuration}s
              </span>
            </div>
          )}
        </div>

        {showConfirm && confirmedAction && (
          // Keep confirm visible even when workflow exists
          <div className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2 text-left transition-all duration-500 ease-in-out opacity-100">
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
                  setWorkflow([])
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

        {workflow.length > 0 && (
          <div className="flex-1 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-left transition-all duration-500 ease-in-out animate-in fade-in slide-in-from-right-4">
            <div className="mb-2 text-xs font-semibold text-slate-300">Workflow</div>
            <ul className="space-y-1 text-xs">
              {workflow.map(step => (
                <li key={step.key} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 transition-colors duration-300 ${step.status === 'done' ? 'bg-emerald-400'
                      : step.status === 'running' ? 'bg-sky-400 animate-pulse'
                        : step.status === 'error' ? 'bg-rose-500'
                          : step.status === 'skipped' ? 'bg-slate-600'
                            : 'bg-slate-700'
                    }`} />
                  <span className={`transition-all duration-300 ${step.status === 'skipped' ? 'line-through text-slate-500' : 'text-slate-200'
                    }`}>{step.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
