import { GoogleGenerativeAI } from '@google/generative-ai'
import axios from 'axios'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY)

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)) }
function roundCurrency(n){ return Math.round(Number(n) * 1000) / 1000 }

// No-op: previously used for step timeouts; removed to allow full negotiation completion

async function pickModel(){
  const names = ['gemini-2.5-flash', 'gemini-2.5-pro']
  for(const name of names){
    try {
      const model = genAI.getGenerativeModel({ model: name })
      // lightweight ping
      if(model.countTokens){
        await model.countTokens('ok')
      }
      console.log('[NEG][Gemini] Selected model:', name)
      return model
    } catch (e){
      console.log('[NEG][Gemini] Model unavailable:', name, e.message)
      continue
    }
  }
  // last resort
  console.log('[NEG][Gemini] Falling back to gemini-2.5-flash without ping')
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
}

async function generateWithRetry({ primaryModel, altModel, prompt, label }){
  try {
    return await primaryModel.generateContent(prompt)
  } catch (e){
    console.log(`[NEG][Gemini] ${label} primary failed:`, e.message)
    if(altModel){
      try {
        console.log(`[NEG][Gemini] ${label} retrying on alt model...`)
        return await altModel.generateContent(prompt)
      } catch (e2){
        console.log(`[NEG][Gemini] ${label} alt failed:`, e2.message)
        throw e2
      }
    }
    throw e
  }
}

function buildContextPrompt(ctx){
  const { creator, post, tips, userStats } = ctx
  return `Context for price negotiation:

Creator:
- Trust score: ${creator.trustScore}
- Reputation: ${creator.reputation}
- Floors: per_min_floor=${creator.menu.perMinFloor}, per_read_floor=${creator.menu.perReadFloor}
- Suggested: per_min=${creator.menu.suggestedPerMin}, per_read=${creator.menu.suggestedPerRead}

Post:
- Title: ${post.title}
- Category: ${post.category}
- Length label: ${post.length}
- Word count: ${post.wordCount}
- Estimated minutes: ${post.estMinutes}

Tips:
- Post tips total: ${tips.postTotal} (count: ${tips.postCount})
- Creator tips total: ${tips.creatorTotal} (count: ${tips.creatorCount})
- User→Creator total: ${tips.userToCreatorTotal} (count: ${tips.userToCreatorCount})
- User→This post total: ${tips.userToPostTotal} (count: ${tips.userToPostCount})

User stats:
- Reads total: ${userStats?.readsTotal || 0}
- Minutes total: ${userStats?.minutesTotal || 0}
- Reads with this creator: ${userStats?.readsWithCreator || 0}
- Minutes with this creator: ${userStats?.minutesWithCreator || 0}

Rules:
- Do NOT use any bucket logic.
- Prefer per-minute when estMinutes >= 3; otherwise consider per-read if fair.
- Respect floors; never go below creator floors.
- Price should reflect prior generosity (higher tips → can accept higher rates) and popularity (more post tips → higher rates reasonable).
- Output JSON only with either per_minute { rate, minMinutes, capMinutes } or per_read { price }.
`
}

function consumerPrompt(ctxWithAnchors){
  const { anchors } = ctxWithAnchors
  return `${buildContextPrompt(ctxWithAnchors)}

You are the CONSUMER agent. Use these quantitative anchors (computed from tips, popularity, trust, and user maturity):
- Consumer anchors: per_minute≈${anchors.consumer.per_minute}, per_read≈${anchors.consumer.per_read}
- Creator floors: per_minute≥${ctxWithAnchors.creator.menu.perMinFloor}, per_read≥${ctxWithAnchors.creator.menu.perReadFloor}

Rules:
- Prefer per_read if estMinutes < 3, else per_minute.
- Stay within ±15% of the consumer anchors and never below floors.
- Set minMinutes≈${anchors.defaults.defaultMin}, capMinutes≈${anchors.defaults.defaultCap} if per_minute.
- Do not exceed 2× the suggested price or 3× the floor.
- If high prior generosity to this creator/post, allow up to +10% above anchor; if user is new (few reads), allow −10%.

Respond JSON only:
{
  "mode": "per_minute" | "per_read",
  "rate": <number>,
  "price": <number>,
  "minMinutes": <number|null>,
  "capMinutes": <number|null>,
  "rationale": "one sentence citing specific metrics and anchors used"
}`
}

function creatorPrompt(ctxWithAnchors, consumerTerms){
  const { anchors } = ctxWithAnchors
  return `${buildContextPrompt(ctxWithAnchors)}

You are the CREATOR agent. You received this consumer proposal:
${JSON.stringify(consumerTerms)}

Use these quantitative anchors (computed from tips, popularity, trust, and user maturity):
- Creator anchors: per_minute≈${anchors.creator.per_minute}, per_read≈${anchors.creator.per_read}
- Do not go below floors. Counters should be within ±15% of creator anchors.
- If consumer chose per_read for short content (<3 min), prefer staying per_read unless there's a strong reason.
- Do not exceed 2× the suggested price or 3× the floor; avoid predatory pricing.
- If post is popular (high post tips) or user is a long-time reader, you may push +10% above creator anchors; if trustScore < 0.55, stay closer to floors (−10%).

Respond JSON only with same fields and include a concise "rationale" referencing the metrics and anchors.`
}

function finalizePrompt(ctx, consumerTerms, creatorTerms){
  return `${buildContextPrompt(ctx)}

As the MEDIATOR, reconcile these proposals into final terms that both sides likely accept.
Consumer: ${JSON.stringify(consumerTerms)}
Creator: ${JSON.stringify(creatorTerms)}

Rules:
- No buckets.
- If mode differs, choose per_minute when estMinutes >= 3; else choose the better value for consumer while staying above floors.
- Set minMinutes around max(1, floor(estMinutes/2)).
- Set capMinutes around clamp(estMinutes + 2, 2, 15).
- Round to 0.001 for rates and 0.01 for prices.
- Compute a weighted compromise using bias weights: favorCreator=${ctx.anchors?.bias?.favorCreator || 0.5}, favorConsumer=${ctx.anchors?.bias?.favorConsumer || 0.5}.
- If user is new (low reads), shift 5–10% toward consumer; if very generous or post is popular, shift 5–10% toward creator.
- Enforce hard bounds: not below floors; not above min(2×suggested, 3×floor).
- Provide a concise "rationale" explaining why the compromise favored consumer or creator.

Respond JSON only with fields: mode, rate or price, minMinutes, capMinutes, rationale.`
}

function coerceTerms(raw, ctx){
  const est = ctx.post.estMinutes
  let mode = raw.mode === 'per_read' ? 'per_read' : 'per_minute'
  let rate = raw.rate != null ? Number(raw.rate) : null
  let price = raw.price != null ? Number(raw.price) : null
  let minMinutes = raw.minMinutes != null ? Number(raw.minMinutes) : Math.max(1, Math.floor(est/2))
  let capMinutes = raw.capMinutes != null ? Number(raw.capMinutes) : clamp(est + 2, 2, 15)

  if(mode === 'per_minute'){
    rate = Math.max(ctx.creator.menu.perMinFloor, roundCurrency(rate || ctx.creator.menu.suggestedPerMin))
    minMinutes = clamp(minMinutes, 1, 10)
    capMinutes = clamp(capMinutes, Math.max(1, minMinutes), 30)
    return { mode, rate: roundCurrency(rate), minMinutes, capMinutes }
  }
  price = Math.max(ctx.creator.menu.perReadFloor, Math.round((price || ctx.creator.menu.suggestedPerRead) * 100) / 100)
  return { mode, price }
}

function parseJson(text){
  const m = text.match(/\{[\s\S]*\}/)
  if(!m) throw new Error('no JSON in response')
  return JSON.parse(m[0])
}

export async function handleNegotiation({ SERVER, userId, postId }){
  try {
    console.log('[NEG] Fetching negotiation context from server...', { SERVER, userId, postId })
    // Fetch context from server
    const t0 = Date.now()
    const { data: ctx } = await axios.get(`${SERVER}/negotiate/context`, { params: { userId, postId }, timeout: 15000 })
    console.log('[NEG] Context fetched in', Date.now() - t0, 'ms', {
      creator: ctx?.creator?.id,
      post: ctx?.post?.id,
      estMinutes: ctx?.post?.estMinutes,
      wordCount: ctx?.post?.wordCount,
      tips: ctx?.tips,
    })

    // Compute default min/cap from metrics
    const est = ctx.post.estMinutes
    const defaultMin = Math.max(1, Math.floor(est / 2))
    const defaultCap = clamp(est + 2, 2, 15)

    // Quantitative anchors for both agents
    const generosity = (ctx.tips.userToCreatorTotal || 0) + (ctx.tips.userToPostTotal || 0)
    const generosityFactor = Math.min(1.5, 1 + generosity / 10) // up to +50%
    const popularity = (ctx.tips.postTotal || 0)
    const popularityFactor = Math.min(1.4, 1 + popularity / 25) // up to +40%
    const userMaturity = Math.min(1.3, 1 + (ctx.userStats?.readsTotal || 0) / 100) // up to +30%
    const trustFactor = 1 + ((ctx.creator.trustScore || 0.7) - 0.7) * 0.5 // +/-15%

    const basePerMin = Math.max(ctx.creator.menu.perMinFloor, ctx.creator.menu.suggestedPerMin || ctx.creator.menu.perMinFloor)
    const basePerRead = Math.max(ctx.creator.menu.perReadFloor, ctx.creator.menu.suggestedPerRead || ctx.creator.menu.perReadFloor)

    // Consumer anchor (values user would accept)
    const consumerPerMin = +(basePerMin * (0.95 * trustFactor) * (1 + (popularityFactor - 1) * 0.3)).toFixed(3)
    const consumerPerRead = +(basePerRead * (0.95 * trustFactor) * (1 + (popularityFactor - 1) * 0.3)).toFixed(2)

    // Creator anchor (sustainable for creator)
    const creatorPerMin = +(basePerMin * (1.05 * trustFactor) * (0.7 + 0.3 * popularityFactor) * (0.8 + 0.2 * userMaturity)).toFixed(3)
    const creatorPerRead = +(basePerRead * (1.05 * trustFactor) * (0.7 + 0.3 * popularityFactor) * (0.8 + 0.2 * userMaturity)).toFixed(2)

    // If user has tipped this creator/post before, nudge up a bit
    const tipNudge = generosity > 0 ? 1.05 : 1.0

  // Bias logic for mediator:
  // - New users (few reads) → favor consumer
  // - High generosity → modestly favor creator
  // - High popularity/trust → modestly favor creator
  // Scale 0..1 where >0.5 favors creator, <0.5 favors consumer
  const maturityScore = Math.min(1, (ctx.userStats?.readsTotal || 0) / 20) // 0..1
  const generosityScore = Math.min(1, generosity / 10)
  const popularityScore = Math.min(1, popularity / 25)
  const trustScore = Math.min(1, (ctx.creator.trustScore || 0.7))
  const favorCreator = 0.25 * generosityScore + 0.25 * popularityScore + 0.25 * trustScore + 0.25 * (1 - (1 - maturityScore))
  const favorConsumer = 1 - favorCreator

    const anchors = {
      consumer: {
        per_minute: Math.max(ctx.creator.menu.perMinFloor, consumerPerMin),
        per_read: Math.max(ctx.creator.menu.perReadFloor, consumerPerRead),
      },
      creator: {
        per_minute: Math.max(ctx.creator.menu.perMinFloor, +(creatorPerMin * tipNudge).toFixed(3)),
        per_read: Math.max(ctx.creator.menu.perReadFloor, +(creatorPerRead * tipNudge).toFixed(2)),
      },
    defaults: { defaultMin, defaultCap },
    bias: { favorCreator: +favorCreator.toFixed(3), favorConsumer: +favorConsumer.toFixed(3) },
    factors: {
      generosity, generosityFactor, popularity, popularityFactor, userMaturity, trustFactor,
    },
    }

    const model = await pickModel()
    // Prepare alternate model if available
    const altModel = genAI.getGenerativeModel({ model: (model?.model === 'gemini-2.5-flash' ? 'gemini-2.5-pro' : 'gemini-2.5-flash') })

  // Round 1: consumer proposal
    console.log('[NEG][Gemini] Generating consumer proposal...')
    const t1 = Date.now()
  const consumerPromptText = consumerPrompt({ ...ctx, anchors })
  const consumerRes = await generateWithRetry({ primaryModel: model, altModel, prompt: consumerPromptText, label: 'consumer proposal' })
    const consumerText = (await consumerRes.response).text()
    console.log('[NEG][Gemini] Consumer proposal in', Date.now() - t1, 'ms:', consumerText?.slice(0, 300))
  const consumerRaw = parseJson(consumerText)
    const consumerTerms = coerceTerms({ ...consumerRaw, minMinutes: consumerRaw.minMinutes ?? defaultMin, capMinutes: consumerRaw.capMinutes ?? defaultCap }, ctx)

    // Round 2: creator counter
    console.log('[NEG][Gemini] Generating creator counter...')
    const t2 = Date.now()
  const creatorPromptText = creatorPrompt({ ...ctx, anchors }, consumerTerms)
  const creatorRes = await generateWithRetry({ primaryModel: model, altModel, prompt: creatorPromptText, label: 'creator counter' })
    const creatorText = (await creatorRes.response).text()
    console.log('[NEG][Gemini] Creator counter in', Date.now() - t2, 'ms:', creatorText?.slice(0, 300))
  const creatorRaw = parseJson(creatorText)
    const creatorTerms = coerceTerms({ ...creatorRaw, minMinutes: creatorRaw.minMinutes ?? defaultMin, capMinutes: creatorRaw.capMinutes ?? defaultCap }, ctx)

    // Finalize
    console.log('[NEG][Gemini] Generating mediator final terms...')
    const t3 = Date.now()
    const finalRes = await model.generateContent(finalizePrompt(ctx, consumerTerms, creatorTerms))
    const finalText = (await finalRes.response).text()
    console.log('[NEG][Gemini] Final terms in', Date.now() - t3, 'ms:', finalText?.slice(0, 300))
  const finalRaw = parseJson(finalText)
    const finalTerms = coerceTerms({ ...finalRaw, minMinutes: finalRaw.minMinutes ?? defaultMin, capMinutes: finalRaw.capMinutes ?? defaultCap }, ctx)

  return {
    ctx,
    consumerTerms,
    creatorTerms,
    finalTerms,
    anchors,
    rationales: {
      consumer: consumerRaw?.rationale || '',
      creator: creatorRaw?.rationale || '',
      final: finalRaw?.rationale || '',
    },
  }
  } catch (e){
    console.error('[NEG] handleNegotiation error:', e?.response?.data || e.message, e.stack)
    // Attempt to fetch minimal context for fallback if not already fetched
    try {
      const { data: ctx } = await axios.get(`${SERVER}/negotiate/context`, { params: { userId, postId }, timeout: 10000 })
      const terms = fallbackTerms(ctx)
      console.log('[NEG] Returning fallback terms due to error:', terms)
      return { ctx, consumerTerms: terms, creatorTerms: terms, finalTerms: terms }
    } catch (e2){
      console.error('[NEG] Fallback also failed:', e2?.response?.data || e2.message)
      throw e
    }
  }
}

// Fallback simple heuristic if Gemini fails
function fallbackTerms(ctx){
  const est = ctx.post.estMinutes
  const preferPerMin = est >= 3
  if(preferPerMin){
    const rate = Math.max(ctx.creator.menu.perMinFloor, ctx.creator.menu.suggestedPerMin || ctx.creator.menu.perMinFloor)
    const minMinutes = Math.max(1, Math.floor(est/2))
    const capMinutes = clamp(est + 2, minMinutes, 15)
    return { mode: 'per_minute', rate: roundCurrency(rate), minMinutes, capMinutes }
  }
  const price = Math.max(ctx.creator.menu.perReadFloor, ctx.creator.menu.suggestedPerRead || ctx.creator.menu.perReadFloor)
  return { mode: 'per_read', price: Math.round(price * 100) / 100 }
}


