import React from 'react'

export default function NegotiationVisualizer({ visible, onClose, consumerName = 'Reader Agent', creatorName = 'Creator Agent', step = 'Starting', logs = [], finalTerms, rationales = {}, ctx, anchors }){
  if(!visible) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Finding a fair price</h3>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <span>{step}</span>
          </div>
          <button onClick={onClose} className="rounded-md bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700">Close</button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-2 w-2 animate-ping rounded-full bg-emerald-400" />
              <div className="text-sm font-medium text-emerald-300">{consumerName}</div>
            </div>
            <div className="h-24 animate-pulse rounded-lg bg-gradient-to-br from-emerald-500/10 to-emerald-400/5" />
            {rationales?.consumer && (
              <p className="mt-3 text-xs text-slate-300">{rationales.consumer}</p>
            )}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-2 w-2 animate-ping rounded-full bg-indigo-400" />
              <div className="text-sm font-medium text-indigo-300">{creatorName}</div>
            </div>
            <div className="h-24 animate-pulse rounded-lg bg-gradient-to-br from-indigo-500/10 to-indigo-400/5" />
            {rationales?.creator && (
              <p className="mt-3 text-xs text-slate-300">{rationales.creator}</p>
            )}
          </div>
        </div>
        <div className="mt-4 max-h-40 overflow-auto rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
          {logs.length === 0 ? (
            <div className="text-slate-500">Agents are exchanging proposals…</div>
          ) : (
            <ul className="space-y-1">
              {logs.map((l, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-slate-500">{String(l.ts || '')}</span>
                  <span>{l.msg}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {finalTerms && (
          <div className="mt-4 rounded-xl border border-emerald-700/40 bg-emerald-500/10 p-4">
            <div className="text-sm text-emerald-300">Agreed terms</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {finalTerms.mode === 'per_minute' ? `${finalTerms.rate} USDC/min · min ${finalTerms.minMinutes} · cap ${finalTerms.capMinutes} min` : `${finalTerms.price} USDC per read`}
            </div>
            {rationales?.final && (
              <p className="mt-2 text-xs text-emerald-200/90">{rationales.final}</p>
            )}
            {(ctx || anchors) && (
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Key metrics</div>
                  <ul className="text-xs text-slate-300 space-y-1">
                    <li>Word count: {ctx?.post?.wordCount} · Est minutes: {ctx?.post?.estMinutes}</li>
                    <li>Post tips: {ctx?.tips?.postTotal} ({ctx?.tips?.postCount})</li>
                    <li>User→Creator tips: {ctx?.tips?.userToCreatorTotal} ({ctx?.tips?.userToCreatorCount})</li>
                    <li>User reads: {ctx?.userStats?.readsTotal} · Minutes: {ctx?.userStats?.minutesTotal}</li>
                  </ul>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Anchors used</div>
                  <ul className="text-xs text-slate-300 space-y-1">
                    <li>Consumer: {anchors?.consumer?.per_minute} / {anchors?.consumer?.per_read}</li>
                    <li>Creator: {anchors?.creator?.per_minute} / {anchors?.creator?.per_read}</li>
                    <li>Defaults: min {anchors?.defaults?.defaultMin} · cap {anchors?.defaults?.defaultCap}</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


