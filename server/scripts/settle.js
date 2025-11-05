import 'dotenv/config'
import axios from 'axios'

const today = new Date().toISOString().slice(0,10)
const s = process.env.PORT || 4000

const agg = await axios.post(`http://localhost:${s}/aggregate_settlements`, { isoDate: today })
console.log('Aggregated totals:', agg.data.totals)

const dist = await axios.post(`http://localhost:${s}/distribute_settlements`, { totals: agg.data.totals })
console.log('Distributed. txHash:', dist.data.txHash, 'mocked:', dist.data.mocked)
