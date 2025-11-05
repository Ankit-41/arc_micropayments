import React, { useCallback, useEffect, useState } from 'react'
import client from '../api/client.js'
import RequireAdmin from '../components/guards/RequireAdmin.jsx'
import useToastStore from '../store/toast.js'

function Stat({ label, value }){
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  )
}

function DataList({ title, items, renderItem, emptyLabel }){
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <div className="mt-3 space-y-3 text-xs text-slate-300">
        {items.length ? items.map(renderItem) : <div className="rounded-lg border border-dashed border-slate-800 px-3 py-2">{emptyLabel}</div>}
      </div>
    </div>
  )
}

export default function AdminDashboard(){
  const toast = useToastStore()
  const [page, setPage] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [runningSettlement, setRunningSettlement] = useState(false)
  const [lastSettlement, setLastSettlement] = useState(null)

  const load = useCallback(async (nextPage = 0) => {
    setLoading(true)
    try {
      const resp = await client.get('/admin/overview', { params: { page: nextPage, limit: 10 } })
      setData(resp.data)
      setPage(nextPage)
    } catch (err){
      console.error(err)
      toast.push('Failed to load admin overview', 'danger')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load(0)
  }, [load])

  const runSettlement = useCallback(async () => {
    setRunningSettlement(true)
    try {
      const isoDate = new Date().toISOString().slice(0, 10)
      const agg = await client.post('/aggregate_settlements', { isoDate })
      const totals = agg.data.totals || {}
      const dist = await client.post('/distribute_settlements', { totals })
      setLastSettlement({ totals, txHash: dist.data.txHash, mocked: dist.data.mocked })
      toast.push(`Settlement distributed (tx: ${dist.data.txHash || 'mocked'})`, 'success')
    } catch (err){
      console.error(err)
      toast.push('Failed to run settlement distribution', 'danger')
    } finally {
      setRunningSettlement(false)
    }
  }, [toast])

  const totals = data?.totals || { approvedTotal: 0, usedTotal: 0, depositedTotal: 0, pendingHold: 0 }
  const approvals = data?.approvals || []
  const deposits = data?.deposits || []
  const credits = data?.credits || []
  const pagination = data?.pagination

  const hasPrev = page > 0
  const hasNext = pagination?.approvals?.hasNext || pagination?.deposits?.hasNext || pagination?.credits?.hasNext

  return (
    <RequireAdmin>
      <section className="flex flex-col gap-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h1 className="text-3xl font-semibold text-white">Admin settlement dashboard</h1>
          <p className="mt-2 text-sm text-slate-400">
            Track approvals, reader usage, and vault funding across the platform.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runSettlement}
              disabled={runningSettlement}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                runningSettlement ? 'cursor-not-allowed bg-slate-900 text-slate-500' : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
              }`}
            >
              {runningSettlement ? 'Running settlement…' : 'Run daily settlement'}
            </button>
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
              <Stat label="Pending holds" value={`${totals.pendingHold.toFixed(2)} USDC`} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <DataList
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
              <DataList
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
            </div>
            <DataList
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
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => hasPrev && load(page - 1)}
                disabled={!hasPrev}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  hasPrev ? 'bg-slate-800 text-white hover:bg-slate-700' : 'cursor-not-allowed bg-slate-900 text-slate-500'
                }`}
              >
                Previous
              </button>
              <div className="text-xs text-slate-400">Page {page + 1}</div>
              <button
                type="button"
                onClick={() => hasNext && load(page + 1)}
                disabled={!hasNext}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  hasNext ? 'bg-slate-800 text-white hover:bg-slate-700' : 'cursor-not-allowed bg-slate-900 text-slate-500'
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
