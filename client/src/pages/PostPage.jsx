import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import client from '../api/client.js'
import useAuthStore from '../store/auth.js'
import useToastStore from '../store/toast.js'
import useUsageSummary from '../hooks/useUsageSummary.js'
import useInterval from '../hooks/useInterval.js'
import TermsCard from '../components/common/TermsCard.jsx'
import NegotiationVisualizer from '../components/common/NegotiationVisualizer.jsx'
import TipButton from '../components/common/TipButton.jsx'
import { useSidebar } from '../context/SidebarContext.jsx'

const statusCopy = {
  idle: 'Preview mode. Negotiate to unlock a metered read.',
  negotiating: 'Talking to pricing agents…',
  ready: 'Terms locked in. Start to unlock the full article.',
  reading: 'Metering in progress. Stay focused to make every second count.',
  paused: 'Preview restored. Resume to continue within the approved allowance.',
  limit: 'Approved allowance for this session has been consumed. Finalize or renegotiate.',
  needs_deposit: 'You have reached 90% of your approved balance. Deposit to continue reading.',
  finalized: 'Session finalized. Charges or refunds have been recorded.',
  preview: 'Preview only – no deal found.',
}

function ActionButton({ label, onClick, disabled, title }){
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
        disabled
          ? 'cursor-not-allowed bg-slate-800/50 text-slate-500'
          : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
      }`}
    >
      {label}
    </button>
  )
}

export default function PostPage(){
  const { slug } = useParams()
  const { setSidebarContent } = useSidebar()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const toast = useToastStore()
  const { summary, refresh: refreshUsage } = useUsageSummary()
  const [post, setPost] = useState(null)
  const [reservationId, setReservationId] = useState(null)
  const [terms, setTerms] = useState(null)
  const [explain, setExplain] = useState(null)
  const [creatorId, setCreatorId] = useState(null)
  const [status, setStatus] = useState('idle')
  const [usage, setUsage] = useState(null)
  const [showFull, setShowFull] = useState(false)
  const [negLogs, setNegLogs] = useState([])
  const [negStep, setNegStep] = useState('Starting')
  const [negResult, setNegResult] = useState(null)
  const [negRationales, setNegRationales] = useState(null)
  const [negAnchors, setNegAnchors] = useState(null)
  const [negCtx, setNegCtx] = useState(null)
  const [showNegModal, setShowNegModal] = useState(false)
  const meterRef = useRef(null)

  const resetMeter = useCallback(() => {
    if(meterRef.current){
      clearInterval(meterRef.current)
      meterRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load(){
      try {
        const resp = await client.get(`/posts/${slug}`)
        if(!cancelled){
          setPost(resp.data.post)
        }
      } catch (err){
        console.error(err)
      }
    }
    load()
    return () => {
      cancelled = true
      resetMeter()
    }
  }, [slug, resetMeter])

  const sendTick = useCallback(async () => {
    if(!reservationId) {
      console.warn('sendTick called without reservationId')
      return
    }
    
    // Detect if page is visible and focused (idle detection)
    const isVisible = !document.hidden
    const hasFocus = document.hasFocus()
    const isActive = isVisible && hasFocus
    
    try {
      const resp = await client.post('/events/read', {
        reservationId,
        tickMs: 5000,
        focus: isActive, // Only charge if page is visible and focused
        visibility: isActive ? 0.9 : 0.1,
        scroll: isActive ? 0.5 : 0,
      })
      setUsage(resp.data.usage)
      if(resp.data.usage.capReached){
        // Cap reached but reading can continue - just show info, don't stop
        toast.push('You\'ve reached the maximum billable time for this session. Reading continues but no additional charges.', 'info')
      }
      if(resp.data.usage.limitReached){
        // Approved amount fully used - need to stop
        resetMeter()
        setStatus('limit')
        setShowFull(false)
        toast.push('You have reached the approved reading limit for this session.', 'warning')
        refreshUsage().catch(() => {})
      }
      if(resp.data.usage.needsDeposit){
        resetMeter()
        setStatus('needs_deposit')
        setShowFull(false)
        toast.push('Your usage hit 90% of the approved balance. Deposit funds to continue.', 'warning')
        refreshUsage().catch(() => {})
        setTimeout(() => navigate('/wallet'), 600)
      }
    } catch (err){
      console.error(err)
      const errorData = err.response?.data
      
      // Handle expiration gracefully
      if(errorData?.expired){
        resetMeter()
        setStatus('paused')
        setShowFull(false)
        const usedMsg = errorData.usedAmount > 0 
          ? `Reading session expired. ${errorData.usedAmount.toFixed(3)} USDC has been charged for the time you read.`
          : 'Reading session expired. No charge as you were idle.'
        toast.push(usedMsg, 'info')
        refreshUsage().catch(() => {})
        return
      }
      
      // Handle other errors - record current usage if possible
      resetMeter()
      setStatus('paused')
      setShowFull(false)
      toast.push('Reading stopped unexpectedly. Your usage up to this point has been recorded.', 'warning')
      refreshUsage().catch(() => {})
    }
  }, [reservationId, resetMeter, toast, navigate, refreshUsage])

  useInterval(() => {
    if(status === 'reading'){
      refreshUsage().catch(() => {})
    }
  }, status === 'reading' ? 30000 : null)

  const negotiate = useCallback(async () => {
    if(!user){
      toast.push('Sign in to negotiate pricing.', 'warning')
      navigate('/auth', { state: { from: `/p/${slug}` } })
      return
    }
    if(!post) return
    setStatus('negotiating')
    setShowNegModal(true)
    setNegLogs([{ ts: new Date().toLocaleTimeString(), msg: 'Negotiation initiated' }])
    setNegStep('Consumer proposal')
    setUsage(null)
    setShowFull(false)
    resetMeter()
    try {
      const resp = await client.post('/negotiate/start', { userId: user.id, postId: post._id })
      if(resp.data.status === 'ok'){
        // Stage the visualizer sequence: consumer → creator → final
        const dbg = resp.data.debug || {}
        const { consumerTerms, creatorTerms, finalTerms } = dbg
        setNegRationales(dbg.rationales || null)
        setNegAnchors(dbg.anchors || null)
        setNegCtx(dbg.ctx || null)
        const stamp = () => new Date().toLocaleTimeString()
        const logs = []
        if(consumerTerms){
          logs.push({ ts: stamp(), msg: `Consumer proposed ${consumerTerms.mode === 'per_minute' ? `${consumerTerms.rate} USDC/min` : `${consumerTerms.price} USDC per read`}` })
        }
        setNegLogs(prev => [...prev, ...logs])
        setNegResult(consumerTerms || null)
        setNegStep('Creator counter')
        // After short delay, show creator
        setTimeout(() => {
          if(creatorTerms){
            setNegLogs(prev => [...prev, { ts: stamp(), msg: `Creator countered ${creatorTerms.mode === 'per_minute' ? `${creatorTerms.rate} USDC/min` : `${creatorTerms.price} USDC per read`}` }])
            setNegResult(creatorTerms)
          }
          setNegStep('Mediator consensus')
          // Then show final
          setTimeout(() => {
            if(finalTerms){
              setNegLogs(prev => [...prev, { ts: stamp(), msg: `Mediator finalized ${finalTerms.mode === 'per_minute' ? `${finalTerms.rate} USDC/min · min ${finalTerms.minMinutes} · cap ${finalTerms.capMinutes}` : `${finalTerms.price} USDC per read`}` }])
              setNegResult(finalTerms)
            }
            // Now store terms and finish (keep modal open until user closes)
            setTerms(resp.data.terms)
            setExplain(resp.data.explain)
            setReservationId(null)
            setCreatorId(resp.data.creatorId)
            setStatus('ready')
            toast.push('Fair price secured. Start reading when ready.', 'success')
          }, 800)
        }, 800)
      } else {
        setStatus('preview')
        toast.push('No overlapping deal found – enjoy the preview.', 'warning')
      }
    } catch (err){
      if(err.response?.data?.error === 'insufficient approved allowance'){
        toast.push('Approve more USDC before negotiating. Redirecting to wallet…', 'warning')
        setTimeout(() => navigate('/wallet'), 500)
      } else {
        toast.push('Negotiation failed. Please try again.', 'danger')
      }
      setStatus('idle')
    }
  }, [user, post, toast, navigate, slug, resetMeter])

  const start = useCallback(async () => {
    if(status === 'reading' || status === 'finalized' || status === 'limit') return
    if(!terms || !creatorId || !post || !user) return
    
    try {
      // Create reservation only when user actually starts reading
      const createResp = await client.post('/create_reservation', {
        userId: user.id,
        postId: post._id,
        creatorId: creatorId,
        mode: terms.mode,
        rateOrPrice: terms.rate || terms.price,
        minMinutes: terms.minMinutes,
        capMinutes: terms.capMinutes,
        ttlSec: 120
      })
      
      const newReservationId = createResp.data.reservationId
      setReservationId(newReservationId)
      setShowFull(true)
      setStatus('reading')
      
      // Create a wrapper function that uses the new reservationId
      const tickWithReservation = async () => {
        if(!newReservationId) return
        try {
          const isVisible = !document.hidden
          const hasFocus = document.hasFocus()
          const isActive = isVisible && hasFocus
          
          const resp = await client.post('/events/read', {
            reservationId: newReservationId,
            tickMs: 5000,
            focus: isActive,
            visibility: isActive ? 0.9 : 0.1,
            scroll: isActive ? 0.5 : 0,
          })
          setUsage(resp.data.usage)
          if(resp.data.usage.capReached){
            toast.push('You\'ve reached the maximum billable time for this session. Reading continues but no additional charges.', 'info')
          }
          if(resp.data.usage.limitReached){
            resetMeter()
            setStatus('limit')
            setShowFull(false)
            toast.push('You have reached the approved reading limit for this session.', 'warning')
            refreshUsage().catch(() => {})
          }
          if(resp.data.usage.needsDeposit){
            resetMeter()
            setStatus('needs_deposit')
            setShowFull(false)
            toast.push('Your usage hit 90% of the approved balance. Deposit funds to continue.', 'warning')
            refreshUsage().catch(() => {})
            setTimeout(() => navigate('/wallet'), 600)
          }
        } catch (err){
          console.error(err)
          const errorData = err.response?.data
          if(errorData?.expired){
            resetMeter()
            setStatus('paused')
            setShowFull(false)
            const usedMsg = errorData.usedAmount > 0 
              ? `Reading session expired. ${errorData.usedAmount.toFixed(3)} USDC has been charged for the time you read.`
              : 'Reading session expired. No charge as you were idle.'
            toast.push(usedMsg, 'info')
            refreshUsage().catch(() => {})
            return
          }
          resetMeter()
          setStatus('paused')
          setShowFull(false)
          toast.push('Reading stopped unexpectedly. Your usage up to this point has been recorded.', 'warning')
          refreshUsage().catch(() => {})
        }
      }
      
      await tickWithReservation()
      resetMeter()
      meterRef.current = setInterval(() => {
        tickWithReservation()
      }, 5000)
    } catch (err){
      if(err.response?.data?.error === 'insufficient approved allowance'){
        toast.push('Insufficient approved allowance. Please approve more USDC.', 'warning')
        setTimeout(() => navigate('/wallet'), 500)
      } else {
        toast.push('Failed to start reading session. Please try again.', 'danger')
      }
      setStatus('ready')
    }
  }, [terms, creatorId, post, user, status, sendTick, resetMeter, toast, navigate])

  const stop = useCallback((nextStatus = 'paused') => {
    resetMeter()
    if(nextStatus) setStatus(nextStatus)
    setShowFull(false)
  }, [resetMeter])

  const finalize = useCallback(async () => {
    if(!reservationId || status === 'finalized') return
    stop(null)
    try {
      const resp = await client.post('/finalize_read', { reservationId })
      setStatus('finalized')
      setShowFull(false)
      toast.push(resp.data.payable ? `Debited ${resp.data.debit} USDC` : `Refunded: ${resp.data.refundedReason}`, 'info')
      refreshUsage().catch(() => {})
    } catch (err){
      console.error(err)
      toast.push('Finalize failed. Please retry.', 'danger')
    }
  }, [reservationId, status, stop, toast, refreshUsage])

  const statusMessage = statusCopy[status] || ''

  const SidebarPanel = useMemo(() => function SidebarPanel(){
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={negotiate}
            disabled={status === 'negotiating'}
            title="Run the one-shot negotiation agents"
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              status === 'negotiating' ? 'cursor-not-allowed bg-slate-800/50 text-slate-500' : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
            }`}
          >
            Find a fair price
          </button>
          <button
            type="button"
            onClick={start}
            disabled={!terms || !creatorId || ['reading', 'finalized', 'limit', 'needs_deposit'].includes(status)}
            title="Unlock the full article and start tracking billable minutes"
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              (!terms || !creatorId || ['reading', 'finalized', 'limit', 'needs_deposit'].includes(status))
                ? 'cursor-not-allowed bg-slate-800/50 text-slate-500'
                : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
            }`}
          >
            Begin metered read
          </button>
          <button
            type="button"
            onClick={() => stop('paused')}
            disabled={status !== 'reading'}
            title="Return to the preview without accruing more usage"
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              status !== 'reading' ? 'cursor-not-allowed bg-slate-800/50 text-slate-500' : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
            }`}
          >
            Pause metering
          </button>
          <button
            type="button"
            onClick={finalize}
            disabled={!reservationId || ['idle', 'negotiating', 'preview', 'finalized'].includes(status)}
            title="Stop metering and record the debit or refund"
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              (!reservationId || ['idle', 'negotiating', 'preview', 'finalized'].includes(status))
                ? 'cursor-not-allowed bg-slate-800/50 text-slate-500'
                : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
            }`}
          >
            Finalize charge
          </button>
        </div>
        <TipButton postId={post._id} creatorId={post.creatorId} postTitle={post.title} />
        <div className="text-xs text-slate-400">{statusMessage}</div>
        <TermsCard 
          terms={terms} 
          explain={explain} 
          usage={usage}
          negotiationData={{
            logs: negLogs,
            step: negStep,
            finalTerms: negResult,
            rationales: negRationales,
            ctx: negCtx,
            anchors: negAnchors,
          }}
        />
      </div>
    )
  }, [negotiate, start, stop, finalize, status, terms, creatorId, reservationId, post, statusMessage, explain, usage, negLogs, negStep, negResult, negRationales, negCtx, negAnchors])

  useEffect(() => {
    if(post && status === 'reading'){
      setSidebarContent(<SidebarPanel />)
    } else {
      setSidebarContent(null)
    }
    return () => setSidebarContent(null)
  }, [post, status, SidebarPanel, setSidebarContent])

  if(!post){
    return <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">Loading…</div>
  }

  return (
    <section className="flex flex-col gap-6">
      <NegotiationVisualizer visible={showNegModal && (status === 'negotiating' || status === 'ready')} onClose={() => setShowNegModal(false)} logs={negLogs} step={negStep} finalTerms={negResult} rationales={negRationales} ctx={negCtx} anchors={negAnchors} />
      <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wide text-emerald-400/80">{post.category}</span>
          <h1 className="text-3xl font-semibold text-white">{post.title}</h1>
          <p className="text-sm text-slate-400">Length: {post.length?.toUpperCase()} · Published {new Date(post.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/40 p-6">
          {showFull
            ? <div className="space-y-4 leading-relaxed text-slate-100" dangerouslySetInnerHTML={{ __html: post.content }} />
            : <p className="text-slate-300">{post.preview} <span className="text-slate-500">(preview)</span></p>}
        </div>
        {status !== 'reading' && (
          <>
            <div className="mt-6 flex flex-wrap gap-3">
              <ActionButton
                label="Find a fair price"
                onClick={negotiate}
                disabled={status === 'negotiating'}
                title="Run the one-shot negotiation agents"
              />
              <ActionButton
                label="Begin metered read"
                onClick={start}
                disabled={!terms || !creatorId || ['reading', 'finalized', 'limit', 'needs_deposit'].includes(status)}
                title="Unlock the full article and start tracking billable minutes"
              />
              <ActionButton
                label="Pause metering"
                onClick={() => stop('paused')}
                disabled={status !== 'reading'}
                title="Return to the preview without accruing more usage"
              />
              <ActionButton
                label="Finalize charge"
                onClick={finalize}
                disabled={!reservationId || ['idle', 'negotiating', 'preview', 'finalized'].includes(status)}
                title="Stop metering and record the debit or refund"
              />
              <TipButton postId={post._id} creatorId={post.creatorId} postTitle={post.title} />
            </div>
            <div className="mt-4 text-sm text-slate-300">
              {statusMessage}
            </div>
          </>
        )}
      </article>
    </section>
  )
}
