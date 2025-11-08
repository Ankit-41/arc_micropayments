import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, index: true },
  passwordHash: String,
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  wallet: { type: String, default: '' },
  dailyCap: { type: Number, default: 5.0 },
  priceSensitivity: { type: Number, default: 0.5 },
  spentToday: { type: Number, default: 0 },
  bucket: { type: String, enum: ['morning', 'afternoon', 'evening'], default: 'afternoon' },
  bucketSpent: {
    morning: { type: Number, default: 0 },
    afternoon: { type: Number, default: 0 },
    evening: { type: Number, default: 0 },
  },
  preferences: { allowModes: [String], like: [String], block: [String] },
  approvedTotal: { type: Number, default: 0 },
  approvedAllowance: { type: Number, default: 0 },
  usedTotal: { type: Number, default: 0 },
  depositedTotal: { type: Number, default: 0 },
  pendingHold: { type: Number, default: 0 },
}, { timestamps: true })

const CreatorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  wallet: String,
  trustScore: { type: Number, default: 0.7 },
  reputation: { type: Number, default: 0.7 },
  menu: { perMinFloor: Number, perReadFloor: Number, suggestedPerMin: Number, suggestedPerRead: Number },
}, { timestamps: true })

const PostSchema = new mongoose.Schema({
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Creator' },
  title: String,
  slug: { type: String, unique: true },
  coverUrl: String,
  category: String,
  length: { type: String, enum: ['short', 'med', 'long'], default: 'med' },
  authorReputation: { type: Number, default: 0.7 },
  excerpt: String,
  content: String,
  published: { type: Boolean, default: true },
}, { timestamps: true })
PostSchema.index({ creatorId: 1, published: 1, category: 1 })

const ReservationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Creator' },
  mode: { type: String, enum: ['per_minute', 'per_read'] },
  rateOrPrice: Number,
  minMinutes: Number,
  capMinutes: Number,
  ttlSec: Number,
  expiresAt: Date,
  approvedAmount: { type: Number, default: 0 },
  usedAmount: { type: Number, default: 0 },
  usedMinutes: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'expired', 'finalized'], default: 'active' },
}, { timestamps: true })
ReservationSchema.index({ userId: 1, expiresAt: 1 })

const TickSchema = new mongoose.Schema({
  reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation' },
  tickMs: Number,
  focus: Boolean,
  visibility: Number,
  scroll: Number,
  ts: { type: Date, default: Date.now },
})

const FinalizedReadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Creator' },
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  mode: { type: String, enum: ['per_minute', 'per_read'] },
  minutes: Number,
  reads: Number,
  debit: Number,
  valid: Boolean,
  refundReason: String,
  ts: { type: Date, default: Date.now },
  settlementBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'SettlementBatch', default: null },
  settledAt: { type: Date, default: null },
})
FinalizedReadSchema.index({ ts: 1, creatorId: 1 })
FinalizedReadSchema.index({ settlementBatchId: 1 })
FinalizedReadSchema.index({ valid: 1, settlementBatchId: 1 })

const LearningSchema = new mongoose.Schema({
  creatorId: mongoose.Schema.Types.ObjectId,
  category: String,
  timeBucket: String,
  perMin: Number,
  perRead: Number,
  updatedAt: Date,
})

const NegLogSchema = new mongoose.Schema({
  negotiateId: String,
  userId: mongoose.Schema.Types.ObjectId,
  postId: mongoose.Schema.Types.ObjectId,
  timeline: Array,
  agreedTerms: Object,
  ts: Date,
})

const SettlementBatchSchema = new mongoose.Schema({
  date: String,
  totals: Object, // Map of creatorId (string) to accumulated amount
  readsByCreator: Object, // Map of creatorId (string) to array of read records
  txHash: String,
  status: { type: String, enum: ['draft', 'distributed'], default: 'draft' },
  csvUri: String,
}, { timestamps: true })

const WalletApprovalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: Number,
  txHash: String,
  chainId: String,
}, { timestamps: true })
WalletApprovalSchema.index({ createdAt: -1 })

const WalletDepositSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: Number,
  txHash: String,
  chainId: String,
}, { timestamps: true })
WalletDepositSchema.index({ createdAt: -1 })

const TipSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Creator' },
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  amount: { type: Number, required: true },
  message: String, // Tip message from user (text or transcribed from voice)
  inputType: { type: String, enum: ['text', 'voice'], default: 'text' },
  txHash: String, // Transaction hash from blockchain
  chainId: String,
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  errorMessage: String,
}, { timestamps: true })
TipSchema.index({ senderId: 1, createdAt: -1 })
TipSchema.index({ creatorId: 1, createdAt: -1 })

export const User = mongoose.model('User', UserSchema)
export const Creator = mongoose.model('Creator', CreatorSchema)
export const Post = mongoose.model('Post', PostSchema)
export const Reservation = mongoose.model('Reservation', ReservationSchema)
export const Tick = mongoose.model('Tick', TickSchema)
export const FinalizedRead = mongoose.model('FinalizedRead', FinalizedReadSchema)
export const Learning = mongoose.model('Learning', LearningSchema)
export const NegLog = mongoose.model('NegLog', NegLogSchema)
export const SettlementBatch = mongoose.model('SettlementBatch', SettlementBatchSchema)
export const WalletApproval = mongoose.model('WalletApproval', WalletApprovalSchema)
export const WalletDeposit = mongoose.model('WalletDeposit', WalletDepositSchema)
export const Tip = mongoose.model('Tip', TipSchema)
