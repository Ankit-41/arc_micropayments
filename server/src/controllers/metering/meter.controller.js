import { FinalizedRead, Reservation, Tick, User } from '../../models/index.js'

const RefundPolicy = { visibilityMin: 0.7, minValidMinutes: 0.33 }

function clampToCap(reservation, minutes){
  if(!reservation.capMinutes) return { minutes, limited: false }
  const remaining = Math.max(0, reservation.capMinutes - reservation.usedMinutes)
  if(minutes <= remaining) return { minutes, limited: false }
  return { minutes: remaining, limited: true }
}

export async function recordReadEvent(req, res){
  const { reservationId, tickMs, focus, visibility, scroll } = req.body
  const reservation = await Reservation.findById(reservationId)
  if(!reservation || reservation.status !== 'active') return res.status(400).json({ error: 'invalid reservation' })
  
  // Extend reservation if user is actively reading (keep-alive)
  const now = new Date()
  const soonThresholdMs = 60_000 // 1 minute
  if(reservation.expiresAt){
    const msUntilExpiry = reservation.expiresAt.getTime() - now.getTime()
    if(msUntilExpiry <= 0){
      if(focus){
        // Auto-extend on activity
        const extendMs = 2 * 60_000 // 2 minutes per active tick
        reservation.expiresAt = new Date(now.getTime() + extendMs)
      } else {
        // If expired and no focus, finalize/expire
        const user = await User.findById(reservation.userId)
        if(!user) return res.status(404).json({ error: 'user not found' })
        
        // Finalize with what was used (if any)
        if(reservation.usedAmount > 0 || reservation.usedMinutes > 0){
          const ticks = await Tick.find({ reservationId })
          const totalMs = ticks.reduce((acc, t) => acc + (t.focus ? t.tickMs : 0), 0)
          const minutes = totalMs / 60000
          
          let debit = 0
          if(reservation.mode === 'per_minute'){
            let billMinutes
            if(minutes < (reservation.minMinutes || 0)){
              billMinutes = reservation.minMinutes || 0
            } else if(minutes <= (reservation.capMinutes || 999)){
              billMinutes = Math.ceil(minutes)
            } else {
              billMinutes = reservation.capMinutes || 999
            }
            debit = +(billMinutes * reservation.rateOrPrice).toFixed(3)
          } else if(reservation.usedAmount > 0){
            debit = +(reservation.rateOrPrice).toFixed(2)
          }
          if(minutes >= RefundPolicy.minValidMinutes){
            user.usedTotal = +(user.usedTotal + debit).toFixed(6)
          }
        }
        user.pendingHold = Math.max(0, +(user.pendingHold - reservation.approvedAmount).toFixed(6))
        user.approvedAllowance = Math.max(0, +(user.approvedTotal - user.usedTotal - user.pendingHold).toFixed(6))
        await user.save()
        reservation.status = 'expired'
        await reservation.save()
        return res.status(400).json({ 
          error: 'reservation expired',
          expired: true,
          usedAmount: reservation.usedAmount || 0,
          message: 'Reading session expired. Used amount has been recorded.' 
        })
      }
    } else if(focus && msUntilExpiry < soonThresholdMs){
      // Proactively extend when near expiry and user is active
      const extendMs = 2 * 60_000
      reservation.expiresAt = new Date(now.getTime() + extendMs)
    }
  }

  const user = await User.findById(reservation.userId)
  if(!user) return res.status(404).json({ error: 'user not found' })

  await Tick.create({ reservationId, tickMs, focus, visibility, scroll })

  let limitReached = false
  let capReached = false
  let addedMinutes = 0
  let addedAmount = 0
  const previousUsedAmount = reservation.usedAmount || 0

  if(focus){
    if(reservation.mode === 'per_minute'){
      const minutes = tickMs / 60000
      const { minutes: allowedMinutes, limited } = clampToCap(reservation, minutes)
      if(limited) capReached = true // Cap minutes reached, but can continue reading
      addedMinutes = allowedMinutes
      addedAmount = +(allowedMinutes * reservation.rateOrPrice).toFixed(6)
    } else if(previousUsedAmount === 0){
      addedAmount = Number(reservation.rateOrPrice || 0)
    }
  }

  const allowanceRemaining = Math.max(0, reservation.approvedAmount - previousUsedAmount)
  if(addedAmount > allowanceRemaining){
    addedAmount = allowanceRemaining
    if(reservation.mode === 'per_minute' && reservation.rateOrPrice > 0){
      addedMinutes = +(allowanceRemaining / reservation.rateOrPrice)
    }
    limitReached = true // Approved amount fully used
  }

  const globalRemaining = Math.max(0, user.approvedTotal - user.usedTotal - previousUsedAmount)
  if(addedAmount > globalRemaining){
    addedAmount = globalRemaining
    if(reservation.mode === 'per_minute' && reservation.rateOrPrice > 0){
      addedMinutes = +(globalRemaining / reservation.rateOrPrice)
    }
    limitReached = true // Global allowance fully used
  }

  if(addedMinutes > 0){
    reservation.usedMinutes = +(reservation.usedMinutes + addedMinutes).toFixed(6)
  }
  if(addedAmount > 0){
    reservation.usedAmount = +(previousUsedAmount + addedAmount).toFixed(6)
  }
  await reservation.save()

  const effectiveUsed = +(user.usedTotal + reservation.usedAmount).toFixed(6)
  const percentUsed = user.approvedTotal > 0 ? Math.min(1, effectiveUsed / user.approvedTotal) : 0
  const needsDeposit = percentUsed >= 0.9
  
  // capMinutes reached means billing limit hit, but reading can continue
  // limitReached means the approved amount is fully used - must stop

  res.json({
    ok: true,
    usage: {
      approvedAmount: reservation.approvedAmount,
      reservationUsed: reservation.usedAmount,
      effectiveUsed,
      approvedTotal: user.approvedTotal,
      usedTotal: user.usedTotal,
      percentUsed,
      needsDeposit,
      limitReached, // Only stop if approved amount is fully used
      capReached, // Cap reached but can continue reading without additional charges
    },
  })
}

export async function finalizeRead(req, res){
  const { reservationId } = req.body
  const reservation = await Reservation.findById(reservationId)
  if(!reservation) return res.status(404).json({ error: 'reservation not found' })
  if(reservation.status !== 'active') return res.status(400).json({ error: 'not active' })

  const user = await User.findById(reservation.userId)
  if(!user) return res.status(404).json({ error: 'user not found' })

  const ticks = await Tick.find({ reservationId })
  const totalMs = ticks.reduce((acc, t) => acc + (t.focus ? t.tickMs : 0), 0)
  const visibilityAvg = ticks.length ? (ticks.reduce((acc, t) => acc + t.visibility, 0) / ticks.length) : 0
  const minutes = totalMs / 60000

  let valid = true
  let refundReason = ''
  if(visibilityAvg < RefundPolicy.visibilityMin){
    valid = false
    refundReason = 'low_visibility'
  }
  if(minutes < RefundPolicy.minValidMinutes){
    valid = false
    refundReason = refundReason || 'too_short'
  }

  let debit = 0
  if(valid){
    if(reservation.mode === 'per_minute'){
      // Billing logic:
      // - If read less than minMinutes: charge for minMinutes
      // - If read >= minMinutes and <= capMinutes: charge for actual minutes used
      // - If read > capMinutes: charge for capMinutes (max)
      let billMinutes
      if(minutes < (reservation.minMinutes || 0)){
        billMinutes = reservation.minMinutes || 0
      } else if(minutes <= (reservation.capMinutes || 999)){
        billMinutes = Math.ceil(minutes) // Charge for actual minutes used
      } else {
        billMinutes = reservation.capMinutes || 999
      }
      debit = +(billMinutes * reservation.rateOrPrice).toFixed(3)
    } else {
      debit = +(reservation.rateOrPrice).toFixed(2)
    }
  }

  reservation.status = 'finalized'
  reservation.usedAmount = valid ? +(debit).toFixed(6) : 0
  reservation.usedMinutes = reservation.mode === 'per_minute' ? minutes : reservation.usedMinutes
  await reservation.save()

  user.pendingHold = Math.max(0, +(user.pendingHold - reservation.approvedAmount).toFixed(6))
  if(valid && debit > 0){
    user.usedTotal = +(user.usedTotal + debit).toFixed(6)
  }
  user.approvedAllowance = Math.max(0, +(user.approvedTotal - user.usedTotal - user.pendingHold).toFixed(6))
  await user.save()

  await FinalizedRead.create({
    userId: reservation.userId,
    creatorId: reservation.creatorId,
    postId: reservation.postId,
    mode: reservation.mode,
    minutes: reservation.mode === 'per_minute' ? minutes : undefined,
    reads: reservation.mode === 'per_read' ? 1 : undefined,
    debit,
    valid,
    refundReason,
  })

  if(valid && debit > 0){
    await User.findByIdAndUpdate(reservation.userId, { $inc: { spentToday: debit, [`bucketSpent.${'afternoon'}`]: debit } })
  }

  res.json({ payable: valid, debit, refundedReason: valid ? null : refundReason })
}
