import React from 'react'

function StatCard({ label, value, accent }){
  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`mt-2 text-xl font-semibold ${accent}`}>{value}</span>
    </div>
  )
}

export default function UsageSummary({ summary }){
  if(!summary) return null
  const pct = Math.round((summary.percentUsed || 0) * 100)
  const format = value => Number(value || 0).toFixed(2)
  return (
    <section className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total approved" value={`${format(summary.approvedTotal)} USDC`} accent="text-emerald-400" />
        <StatCard label="Total used" value={`${format(summary.usedTotal)} USDC`} accent="text-sky-400" />
        <StatCard label="Available" value={`${format(summary.availableAllowance)} USDC`} accent="text-indigo-400" />
        <StatCard label="Deposits" value={`${format(summary.depositedTotal)} USDC`} accent="text-amber-400" />
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-400">
          <span>Usage against approvals</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </section>
  )
}
