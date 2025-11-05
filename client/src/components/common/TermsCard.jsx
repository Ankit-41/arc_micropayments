import React, { useState } from 'react'
import NegotiationVisualizer from './NegotiationVisualizer.jsx'

export default function TermsCard({ terms, explain, usage, negotiationData }){
  const [showNegModal, setShowNegModal] = useState(false)
  if(!terms) return null
  const currencyDigits = terms.mode === 'per_minute' ? 3 : 2
  const detailParts = []
  if(terms.mode === 'per_minute'){
    if(terms.minMinutes) detailParts.push(`min ${terms.minMinutes}`)
    if(terms.capMinutes) detailParts.push(`cap ${terms.capMinutes}`)
  }
  const needsDeposit = usage?.needsDeposit

  // Extract negotiation data from explain or use passed negotiationData
  const negData = negotiationData || (explain?.negotiation ? {
    logs: explain.negotiation.logs || [],
    step: explain.negotiation.step || 'Completed',
    finalTerms: terms,
    rationales: explain.negotiation.rationales || {},
    ctx: explain.negotiation.ctx,
    anchors: explain.negotiation.anchors,
  } : null)

  return (
    <>
      <NegotiationVisualizer 
        visible={showNegModal} 
        onClose={() => setShowNegModal(false)} 
        logs={negData?.logs || []} 
        step={negData?.step || 'Completed'} 
        finalTerms={negData?.finalTerms || terms} 
        rationales={negData?.rationales || {}} 
        ctx={negData?.ctx} 
        anchors={negData?.anchors} 
      />
      <div className="rounded-2xl border border-emerald-600/40 bg-emerald-600/10 p-5 text-emerald-100">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-emerald-200">
              {terms.mode === 'per_minute'
                ? `${terms.rate.toFixed(3)} USDC / min`
                : `${terms.price.toFixed(2)} USDC per read`}
            </h3>
            {detailParts.length > 0 && (
              <p className="text-sm text-emerald-300/80">{detailParts.join(' · ')}</p>
            )}
          </div>
        </div>
        {needsDeposit && (
          <div className="mt-3 rounded-lg bg-amber-500/20 px-3 py-2 text-sm text-amber-200">
            You are almost out of approved balance. Deposit funds before continuing.
          </div>
        )}
        {negData && (
          <button
            type="button"
            onClick={() => setShowNegModal(true)}
            className="mt-4 text-sm font-semibold text-emerald-200/80 hover:text-emerald-200 underline"
          >
            How we calculated this
          </button>
        )}
      </div>
    </>
  )
}
