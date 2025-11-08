import React, { useCallback, useEffect, useState } from 'react'
import client from '../api/client.js'
import RequireAdmin from '../components/guards/RequireAdmin.jsx'
import useToastStore from '../store/toast.js'

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  )
}

function CollapsibleSection({ title, items, renderItem, emptyLabel, defaultOpen = false }) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-left"
      >
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <svg
          className={`h-5 w-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="mt-3 space-y-3 text-xs text-slate-300">
          {items.length ? items.map(renderItem) : <div className="rounded-lg border border-dashed border-slate-800 px-3 py-2">{emptyLabel}</div>}
        </div>
      )}
    </div>
  )
}

export default function AdminDashboard() {
  const toast = useToastStore()
  const [page, setPage] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [runningSettlement, setRunningSettlement] = useState(false)
  const [lastSettlement, setLastSettlement] = useState(null)
  const [recentBatches, setRecentBatches] = useState([])
  const [creatorMeta, setCreatorMeta] = useState({})
  const [hasDraftBatch, setHasDraftBatch] = useState(false)

  const load = useCallback(async (nextPage = 0) => {
    setLoading(true)
    try {
      const resp = await client.get('/admin/overview', { params: { page: nextPage, limit: 10 } })
      setData(resp.data)
      setPage(nextPage)
    } catch (err) {
      console.error(err)
      toast.push('Failed to load admin overview', 'danger')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load(0)
    // also load recent settlements
    client.get('/settlements/recent').then(resp => {
      setRecentBatches(resp.data.batches || [])
      setCreatorMeta(resp.data.creators || {})
      // Check if there's a draft batch
      const draftBatch = (resp.data.batches || []).find(b => b.status === 'draft')
      setHasDraftBatch(!!draftBatch)
    }).catch(() => { })
  }, [load])

  const runSettlement = useCallback(async () => {
    // Prevent multiple simultaneous settlement runs
    if (runningSettlement) {
      return
    }

    setRunningSettlement(true)
    try {
      const agg = await client.post('/aggregate_settlements', {})
      const totals = agg.data.totals || {}
      if (Object.keys(totals).length === 0) {
        toast.push('No unsettled reads found.', 'info')
        setRunningSettlement(false)
        setHasDraftBatch(false)
        return
      }

      // If this is an existing batch, inform the user
      if (agg.data.existingBatch) {
        toast.push('Found existing draft batch. Distributing now...', 'info')
      }

      const dist = await client.post('/distribute_settlements', { batchId: agg.data.batchId })
      setLastSettlement({ totals, txHash: dist.data.txHash, mocked: dist.data.mocked, batchId: dist.data.batchId })
      toast.push(`Settlement distributed (tx: ${dist.data.txHash || 'mocked'})`, 'success')
      setHasDraftBatch(false)

      // refresh recent batches
      client.get('/settlements/recent').then(resp => {
        setRecentBatches(resp.data.batches || [])
        setCreatorMeta(resp.data.creators || {})
        const draftBatch = (resp.data.batches || []).find(b => b.status === 'draft')
        setHasDraftBatch(!!draftBatch)
      }).catch(() => { })
    } catch (err) {
      console.error(err)
      const errorMsg = err.response?.data?.error || 'Failed to run settlement distribution'
      if (errorMsg.includes('already distributed')) {
        toast.push('This batch has already been distributed. Refreshing...', 'warning')
        setHasDraftBatch(false)
        // refresh to update UI
        client.get('/settlements/recent').then(resp => {
          setRecentBatches(resp.data.batches || [])
          setCreatorMeta(resp.data.creators || {})
          const draftBatch = (resp.data.batches || []).find(b => b.status === 'draft')
          setHasDraftBatch(!!draftBatch)
        }).catch(() => { })
      } else {
        toast.push(errorMsg, 'danger')
      }
    } finally {
      setRunningSettlement(false)
    }
  }, [toast, runningSettlement])

  const totals = data?.totals || { approvedTotal: 0, usedTotal: 0, depositedTotal: 0, pendingHold: 0, vaultBalance: null }
  const approvals = data?.approvals || []
  const deposits = data?.deposits || []
  const credits = data?.credits || []
  const tips = data?.tips || []
  const pagination = data?.pagination

  const hasPrev = page > 0
  const hasNext = pagination?.approvals?.hasNext || pagination?.deposits?.hasNext || pagination?.credits?.hasNext || pagination?.tips?.hasNext

  return (
    <RequireAdmin>
      <section className="flex flex-col gap-6">
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950/90 p-5 backdrop-blur-sm">
          <div className="flex items-start gap-3 mb-4">
            <div className="rounded-lg bg-amber-500/10 p-2">
              <svg className="h-5 w-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-white mb-1.5">Admin settlement dashboard</h1>
              <p className="text-xs text-slate-300 leading-relaxed">
                Track approvals, reader usage, and vault funding across the platform.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runSettlement}
              disabled={runningSettlement}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${runningSettlement ? 'cursor-not-allowed bg-slate-900 text-slate-500' : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
                }`}
            >
              {runningSettlement ? 'Running settlement…' : hasDraftBatch ? 'Distribute existing batch' : 'Run daily settlement'}
            </button>
            {hasDraftBatch && !runningSettlement && (
              <div className="text-xs text-amber-400">
                Draft batch exists. Click to distribute.
              </div>
            )}
            {lastSettlement && (
              <div className="text-xs text-slate-400">
                Last tx: <span className="font-mono text-emerald-300">{lastSettlement.txHash}</span>{' '}
                {lastSettlement.mocked ? '(mock)' : ''}
              </div>
            )}
          </div>
        </div>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-32 animate-pulse rounded-2xl bg-slate-900/50" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Stat label="Total approved" value={`${totals.approvedTotal.toFixed(2)} USDC`} />
              <Stat label="Total used" value={`${totals.usedTotal.toFixed(2)} USDC`} />
              <Stat label="Deposited to vault" value={`${totals.depositedTotal.toFixed(2)} USDC`} />
              <Stat
                label="Current vault balance"
                value={
                  totals.vaultBalance != null && typeof totals.vaultBalance === 'number'
                    ? `${totals.vaultBalance.toFixed(2)} USDC`
                    : 'N/A'
                }
              />
            </div>

            <CollapsibleSection
              title="Recent approvals"
              items={approvals}
              emptyLabel="No approvals recorded yet."
              renderItem={item => (
                <div key={item.id} className="rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2">
                  <div className="font-semibold text-slate-100">{Number(item.amount).toFixed(2)} USDC</div>
                  <div className="text-slate-400">{item.userEmail}</div>
                  <div className="truncate text-slate-500">{item.txHash}</div>
                  <div className="text-slate-500">{new Date(item.createdAt).toLocaleString()}</div>
                </div>
              )}
            />
            <CollapsibleSection
              title="Recent deposits"
              items={deposits}
              emptyLabel="No deposits recorded yet."
              renderItem={item => (
                <div key={item.id} className="rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2">
                  <div className="font-semibold text-slate-100">{Number(item.amount).toFixed(2)} USDC</div>
                  <div className="text-slate-400">{item.userEmail}</div>
                  <div className="truncate text-slate-500">{item.txHash}</div>
                  <div className="text-slate-500">{new Date(item.createdAt).toLocaleString()}</div>
                </div>
              )}
            />

            <CollapsibleSection
              title="Recent credits to creators"
              items={credits}
              emptyLabel="No valid reads yet."
              renderItem={item => (
                <div key={item.id} className="rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2">
                  <div className="font-semibold text-slate-100">{Number(item.debit).toFixed(2)} USDC</div>
                  <div className="text-slate-400">Reader: {item.userEmail || item.userId}</div>
                  <div className="text-slate-500">Creator wallet: {item.creatorWallet || '—'}</div>
                  <div className="text-slate-500">{new Date(item.ts).toLocaleString()}</div>
                </div>
              )}
            />
            <CollapsibleSection
              title="Recent tips"
              items={tips}
              emptyLabel="No tips recorded yet."
              renderItem={item => (
                <div key={item.id} className="rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2">
                  <div className="font-semibold text-slate-100">{Number(item.amount).toFixed(2)} USDC</div>
                  <div className="text-slate-400">From: {item.senderEmail || item.senderId}</div>
                  <div className="text-slate-400">To: {item.creatorEmail || item.creatorId}</div>
                  <div className="text-slate-500">Post: {item.postTitle || item.postId || '—'}</div>
                  {item.message && (
                    <div className="text-slate-500 italic">"{item.message}"</div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
                        item.status === 'pending' ? 'bg-amber-500/20 text-amber-300' :
                          'bg-red-500/20 text-red-300'
                      }`}>
                      {item.status}
                    </span>
                    {item.txHash && (
                      <div className="truncate text-slate-500 text-xs">{item.txHash}</div>
                    )}
                  </div>
                  <div className="text-slate-500">{new Date(item.createdAt).toLocaleString()}</div>
                </div>
              )}
            />
            <CollapsibleSection
              title="Recent settlement batches"
              items={recentBatches}
              emptyLabel="No settlements yet."
              renderItem={batch => (
                <div key={batch._id} className="rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-100">{batch.date}</div>
                    <div className="text-slate-400">{batch.status}</div>
                  </div>
                  {batch.txHash && (
                    <div className="truncate text-slate-500">tx: {batch.txHash}</div>
                  )}
                  <div className="mt-2 grid gap-2">
                    {Object.entries(batch.totals || {}).map(([creatorId, amount]) => (
                      <div key={creatorId} className="rounded border border-slate-800/60 bg-slate-950/60 p-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-slate-200">{creatorMeta[creatorId]?.name || creatorId}</div>
                            <div className="text-slate-500">{creatorMeta[creatorId]?.wallet || '—'}</div>
                          </div>
                          <div className="font-semibold text-emerald-300">{Number(amount).toFixed(2)} USDC</div>
                        </div>
                        {batch.readsByCreator?.[creatorId] && (
                          <div className="mt-2 rounded bg-slate-900/60 p-2">
                            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Constituent reads</div>
                            <ul className="space-y-1 text-slate-300">
                              {batch.readsByCreator[creatorId].map(r => (
                                <li key={r.id} className="flex items-center justify-between text-xs">
                                  <span>{new Date(r.ts).toLocaleString()} · {r.mode === 'per_minute' ? `${r.minutes} min` : `${r.reads} read`}</span>
                                  <span className="font-medium">{Number(r.debit).toFixed(2)} USDC</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => hasPrev && load(page - 1)}
                disabled={!hasPrev}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${hasPrev ? 'bg-slate-800 text-white hover:bg-slate-700' : 'cursor-not-allowed bg-slate-900 text-slate-500'
                  }`}
              >
                Previous
              </button>
              <div className="text-xs text-slate-400">Page {page + 1}</div>
              <button
                type="button"
                onClick={() => hasNext && load(page + 1)}
                disabled={!hasNext}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${hasNext ? 'bg-slate-800 text-white hover:bg-slate-700' : 'cursor-not-allowed bg-slate-900 text-slate-500'
                  }`}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </RequireAdmin>
  )
}
