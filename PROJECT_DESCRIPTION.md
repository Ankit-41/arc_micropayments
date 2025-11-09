# Arc Micropayments MVP - Complete Project Description

## Executive Summary

Arc Micropayments MVP is a decentralized content monetization platform that enables users to pay creators for reading premium content using micropayments on the Arc Testnet blockchain. The system implements a prepayment model where users deposit USDC tokens into a smart contract vault, and funds are automatically distributed to creators based on reading time and engagement metrics. The platform features AI-powered negotiation agents, voice-enabled interactions, real-time metering, and automated settlement systems.

---

## 1. System Architecture

### 1.1 Technology Stack

**Frontend:**
- React 18 with Vite
- React Router for navigation
- Tailwind CSS for styling
- Ethers.js for blockchain interaction
- MetaMask for wallet integration

**Backend:**
- Node.js with Express
- MongoDB with Mongoose ODM
- JWT authentication
- Role-based access control (Admin/User)

**Smart Contracts:**
- Solidity (^0.8.30)
- Foundry for development and testing
- Arc Testnet deployment
- ERC-20 USDC token integration

**AI Agents Service:**
- Google Gemini AI (gemini-2.5-flash, gemini-2.5-pro)
- Eleven Labs Speech-to-Text API
- Express microservice architecture
- Crew pattern for agent orchestration

**Infrastructure:**
- Docker Compose for containerization
- MongoDB for data persistence
- Environment-based configuration

### 1.2 System Components

1. **Client Application** (`client/`)
   - User-facing React application
   - Wallet management interface
   - Post reading interface with metering
   - Creator studio
   - Admin dashboard

2. **Server Application** (`server/`)
   - RESTful API server
   - Authentication and authorization
   - Business logic controllers
   - Database models and schemas
   - Settlement processing

3. **Agents Service** (`agents/`)
   - Negotiation agent
   - Tip processing agent
   - Wallet operations agent
   - Orchestrator agent

4. **Smart Contracts** (`foundry/hello-arc/src/`)
   - PayoutVault.sol - Main vault contract
   - HelloArchitect.sol - Additional contract utilities

---

## 2. Smart Contract: PayoutVault

### 2.1 Contract Overview

The `PayoutVault` contract is the core smart contract that manages pooled USDC deposits and distributes funds to creators. It implements a secure, fee-based distribution system.

### 2.2 Key Features

**Contract State:**
- `owner`: Contract owner address (can be transferred)
- `platformFeeWallet`: Address where platform fees are sent
- `feeBps`: Fee basis points (250 = 2.5%, max 2000 = 20%)
- `usdc`: ERC-20 USDC token contract address
- `userDeposits`: Mapping of user address to deposit amount
- `totalPooled`: Total USDC pooled in the vault

### 2.3 Core Functions

#### Deposit Function
```solidity
function deposit(uint256 amount) external usdcSet
```
- Users deposit USDC into the vault
- Requires USDC token approval first
- Updates `userDeposits` mapping and `totalPooled`
- Emits `Deposited` event

#### Withdraw Function
```solidity
function withdraw(uint256 amount) external usdcSet
```
- Users can withdraw their deposited funds
- Checks sufficient balance in `userDeposits`
- Transfers USDC back to user
- Updates `totalPooled` accordingly
- Emits `Withdrawn` event

#### Distribute Function (Owner Only)
```solidity
function distribute(address[] calldata creators, uint256[] calldata amounts) external onlyOwner usdcSet
```
- **Critical Function**: Distributes funds to multiple creators in a single transaction
- Takes arrays of creator addresses and corresponding amounts
- Calculates platform fee based on `feeBps`
- Transfers funds to each creator
- Transfers platform fee to `platformFeeWallet`
- Deducts total (amounts + fee) from `totalPooled`
- Emits `Distributed` event with batch ID

#### Configuration Functions
- `setUSDC(address)`: Set USDC token contract address
- `setPlatformFeeWallet(address)`: Set fee recipient wallet
- `setFeeBps(uint256)`: Set fee basis points (max 2000)
- `transferOwnership(address)`: Transfer contract ownership

### 2.4 Security Features

- **Only Owner Modifier**: Distribution and configuration functions are owner-only
- **USDC Set Check**: Ensures USDC address is configured before operations
- **Fee Cap**: Maximum fee of 20% (2000 basis points)
- **Zero Address Validation**: Prevents setting invalid addresses
- **Array Length Validation**: Ensures creators and amounts arrays match

### 2.5 Events

- `OwnerTransferred`: Ownership transfer events
- `USDCSet`: USDC token configuration
- `PlatformFeeWalletSet`: Fee wallet configuration
- `FeeBpsSet`: Fee configuration
- `Deposited`: User deposit events
- `Withdrawn`: User withdrawal events
- `Distributed`: Batch distribution events (includes batch ID hash)

---

## 3. AI Agents System

### 3.1 Architecture

The agents service is a microservice that processes natural language inputs (text or voice) and extracts structured data for various operations. It uses Google Gemini AI for natural language understanding and Eleven Labs for voice transcription.

### 3.2 Agent Types

#### 3.2.1 Negotiation Agent (`negotiationAgent.js`)

**Purpose**: Automatically negotiates pricing between users and creators for content access.

**Workflow:**
1. **Context Gathering**: Fetches negotiation context from server including:
   - Creator trust score, reputation, pricing floors and suggestions
   - Post details (title, category, length, word count, estimated reading time)
   - Tip statistics (post tips, creator tips, user-to-creator tips, user-to-post tips)
   - User statistics (total reads, minutes, reads with creator, minutes with creator)

2. **Anchor Calculation**: Computes quantitative anchors based on:
   - **Generosity Factor**: Based on user's prior tips to creator/post (up to +50%)
   - **Popularity Factor**: Based on post tip totals (up to +40%)
   - **User Maturity**: Based on total reads (up to +30%)
   - **Trust Factor**: Based on creator trust score (±15%)
   - **Consumer Anchor**: Price user would accept (slightly below base)
   - **Creator Anchor**: Sustainable price for creator (slightly above base)

3. **Three-Round Negotiation**:
   - **Round 1 - Consumer Proposal**: Gemini generates consumer-friendly proposal using consumer anchors
   - **Round 2 - Creator Counter**: Gemini generates creator response considering consumer proposal
   - **Round 3 - Mediator Finalization**: Gemini reconciles proposals into final terms

4. **Bias Logic**: Mediator uses weighted factors:
   - New users → favor consumer
   - High generosity → favor creator
   - High popularity/trust → favor creator
   - Bias score (0-1) determines compromise direction

5. **Term Coercion**: Ensures terms respect:
   - Creator floor prices (minimum rates)
   - Mode selection (per_minute for ≥3 min, per_read for shorter)
   - Min/cap minutes constraints
   - Price bounds (not above 2× suggested or 3× floor)

**Output**: Final terms with mode (per_minute/per_read), rate/price, minMinutes, capMinutes, and rationale.

#### 3.2.2 Tip Agent (`tipAgent.js`)

**Purpose**: Processes tip requests from users to creators.

**Workflow:**
1. **Voice Transcription** (if voice input): Uses Eleven Labs API to transcribe audio to text
2. **Gemini Processing**: Extracts tip amount and optional message from user input
3. **Context Consideration**: Uses post context (title, category) for better understanding
4. **Fallback Logic**: If transcription fails, uses default tip amount

**Output**: Structured data with amount (USDC) and message.

#### 3.2.3 Wallet Agent (`walletAgent.js`)

**Purpose**: Processes wallet operations (approve/deposit).

**Workflow:**
1. **Voice Transcription** (if voice input): Transcribes audio using Eleven Labs
2. **Intent Extraction**: Gemini extracts action type (approve/deposit) and amount
3. **Context Awareness**: Considers wallet context (available allowance, last approval)
4. **Validation**: Ensures action is either "approve" or "deposit"

**Output**: Action type and amount.

#### 3.2.4 Orchestrator Agent (`orchestratorAgent.js`)

**Purpose**: Routes user input to appropriate agent (tip/approve/deposit).

**Workflow:**
1. **Voice Transcription** (if voice input)
2. **Intent Classification**: Determines if user wants to tip, approve, or deposit
3. **Routing**: Returns action and amount for frontend to route to correct flow

**Output**: Action (tip/approve/deposit) and amount.

### 3.3 Voice Processing

**Eleven Labs Integration:**
- API endpoint: `https://api.elevenlabs.io/v1/speech-to-text`
- Model: `scribe_v1`
- Input: Base64-encoded audio (WebM format)
- Output: Transcribed text
- Error Handling: Falls back to default values if transcription fails

### 3.4 Gemini AI Integration

**Models Used:**
- Primary: `gemini-2.5-flash` (fast, cost-effective)
- Fallback: `gemini-2.5-pro` (more capable, slower)

**Pattern:**
1. Try primary model
2. If fails, try fallback model
3. If both fail, use pattern matching fallback

**Prompt Engineering:**
- Structured prompts with context
- JSON-only responses
- Explicit rules and constraints
- Example-based learning

---

## 4. User Workflows

### 4.1 Authentication & Wallet Setup

**Registration/Login:**
1. User registers with email and password
2. System creates user account with default settings
3. User connects MetaMask wallet (Arc Testnet)
4. Wallet address stored in user profile

**Wallet Connection:**
- MetaMask integration
- Network validation (Arc Testnet, Chain ID: 5042002)
- Address verification
- Persistent wallet association

### 4.2 Wallet Operations

#### Approval Flow
1. User navigates to Wallet page
2. User specifies amount to approve (text or voice)
3. Wallet agent processes input
4. Frontend calls USDC `approve()` function with vault address
5. MetaMask prompts for transaction signature
6. Transaction sent to blockchain
7. Backend records approval in database
8. User's `approvedTotal` increases
9. `approvedAllowance` recalculated

#### Deposit Flow
1. User specifies deposit amount (text or voice)
2. Wallet agent processes input
3. If insufficient allowance, approval flow triggered first
4. Frontend calls vault `deposit()` function
5. MetaMask prompts for transaction
6. USDC transferred from user to vault
7. Backend records deposit
8. User's `depositedTotal` increases
9. Vault balance updates

**Voice-Enabled Operations:**
- Users can use voice commands for approve/deposit
- Voice input transcribed by Eleven Labs
- Processed by wallet agent
- Same blockchain flow as text input

### 4.3 Content Discovery & Reading

#### Homepage
- Displays premium creator posts
- Filter by category
- Search functionality
- Post previews with cover images

#### Post Reading Flow
1. **Post Selection**: User clicks on a post
2. **Negotiation Trigger**: System initiates price negotiation
3. **Agent Negotiation**: 
   - Negotiation agent fetches context
   - Three-round negotiation process
   - Final terms generated
4. **Reservation Creation**:
   - System creates reservation with negotiated terms
   - `approvedAmount` calculated (capMinutes × rate for per_minute, or price for per_read)
   - Amount held in `pendingHold`
   - `approvedAllowance` decreased
   - Reservation expires after TTL (capMinutes + buffer)
5. **Reading Session**:
   - Post content unlocked
   - Metering system tracks reading metrics
   - Real-time usage updates

### 4.4 Metering System

#### Reading Metrics Tracked
- **Tick Events**: Periodic events (every few seconds)
  - `tickMs`: Milliseconds since last tick
  - `focus`: Boolean (tab/window focused)
  - `visibility`: Number (0-1, page visibility API)
  - `scroll`: Number (scroll position)

#### Billing Logic

**Per-Minute Mode:**
- Tracks focused reading time only
- Minimum billing: `minMinutes` (even if read less)
- Maximum billing: `capMinutes` (even if read more)
- Real-time calculation: `usedMinutes × rate`
- Updates `usedAmount` as user reads

**Per-Read Mode:**
- Single charge when reading starts (if focused)
- No time-based tracking
- Fixed price from negotiation

#### Reservation Management
- **Auto-Extension**: If user is actively reading near expiry, reservation extends
- **Expiry Handling**: If expired and no focus, reservation finalized with used amount
- **Limit Enforcement**: 
  - `limitReached`: Approved amount fully used (must stop)
  - `capReached`: Cap minutes reached (can continue without additional charges)

#### Finalization
1. User finishes reading or reservation expires
2. System finalizes read:
   - Calculates total focused minutes
   - Applies billing logic (min/cap constraints)
   - Validates read quality (visibility, duration)
   - Creates `FinalizedRead` record
3. **Quality Validation**:
   - Minimum visibility threshold
   - Minimum reading duration
   - Invalid reads marked with refund reason
4. **User Account Updates**:
   - `pendingHold` released
   - `usedTotal` increased (if valid)
   - `approvedAllowance` recalculated

### 4.5 Tipping System

#### Tip Flow
1. **User Initiates Tip**: 
   - Clicks "Tip Creator" button on post
   - Selects text or voice input
2. **Agent Processing**:
   - Tip agent processes input (voice transcribed if needed)
   - Extracts amount and message
3. **Validation**:
   - Checks sufficient `approvedAllowance`
   - Validates creator wallet exists
4. **Transaction Creation**:
   - Tip record created with "pending" status
   - Frontend prepares MetaMask transaction
5. **Blockchain Transaction**:
   - User signs USDC transfer transaction
   - USDC transferred directly to creator wallet
   - Transaction hash recorded
6. **Confirmation**:
   - Backend updates tip status to "completed"
   - User's `usedTotal` increased
   - `approvedAllowance` decreased
   - Tip history updated

**Voice-Enabled Tipping:**
- Users can record voice message
- Transcribed to text using Eleven Labs API
- Amount and message extracted by Gemini AI
- Same blockchain flow

#### 4.5.1 Tip Setup & Configuration

**Environment Variables:**
- `GOOGLE_GEMINI_API_KEY`: Required for tip amount/message extraction
- `ELEVEN_LABS_API_KEY`: Required for voice transcription
- `AGENTS_BASE_URL`: URL of the agents service
- `SERVER_BASE_URL`: URL of the server API

**API Keys Setup:**

1. **Google Gemini API**:
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Add to `agents/.env` as `GOOGLE_GEMINI_API_KEY`

2. **Eleven Labs API**:
   - Go to [Eleven Labs](https://elevenlabs.io/)
   - Sign up/login
   - Get your API key from the dashboard
   - Add to `agents/.env` as `ELEVEN_LABS_API_KEY`
   - **Note:** Eleven Labs Speech-to-Text API might require a subscription

**Example User Inputs:**
- Text: "Send 5 USDC", "Tip 2 USDC, great article!", "Send 10 dollars to the creator"
- Voice: "I'd like to send 3 USDC as a tip for this great post"

**Tip Processing:**
- Gemini AI extracts amount (defaults to 1.0 USDC if not specified) and optional message
- If voice input fails to transcribe, system uses default tip amount
- Tip amount must not exceed available `approvedAllowance`

#### 4.5.2 Tip API Endpoints

**POST `/tip/process`**
Process tip request with crew agent

Request:
```json
{
  "postId": "post_id_here",
  "userInput": "Send 5 USDC",
  "inputType": "text",
  "audioData": "base64_encoded_audio" // if voice input
}
```

Response:
```json
{
  "tipId": "tip_id_here",
  "amount": 5,
  "message": "great article",
  "creatorWallet": "0x...",
  "senderWallet": "0x...",
  "usdcAddress": "0x...",
  "transcribedText": "..." // if voice input
}
```

**POST `/tip/confirm`**
Confirm tip after MetaMask transaction

Request:
```json
{
  "tipId": "tip_id_here",
  "txHash": "0x...",
  "chainId": "5042002"
}
```

**GET `/tip/history?type=sent` or `?type=received`**
Get tip history for user

#### 4.5.3 Troubleshooting Tips

**"Failed to transcribe voice input"**
- Check Eleven Labs API key is valid
- Verify subscription/credits available
- Check network connection

**"Tip processing failed"**
- Check Google Gemini API key
- Verify agents service is running
- Check server logs for errors

**MetaMask transaction fails**
- Verify user has sufficient USDC balance
- Check USDC contract address is correct
- Ensure wallet is connected
- Verify sufficient `approvedAllowance` (may need to approve more USDC)

### 4.6 Creator Studio

**Features:**
- Create and manage posts
- Set pricing menu (per_minute floor, per_read floor, suggestions)
- View post analytics
- Manage creator profile
- Set wallet address for payouts

---

## 5. Settlement System

### 5.1 Overview

The settlement system aggregates finalized reads and distributes accumulated payments to creators in batches. It prevents double-settlement and ensures accurate fund distribution.

### 5.2 Settlement Workflow

#### 5.2.1 Aggregation Phase

1. **Unsettled Reads Query**:
   - Fetches all `FinalizedRead` records with `valid: true`
   - Excludes reads with `settlementBatchId` (already settled)
   - Filters out invalid reads (low visibility, too short)

2. **Batch Creation**:
   - Creates `SettlementBatch` with status "draft"
   - Aggregates amounts per creator:
     - Groups reads by `creatorId`
     - Sums `debit` amounts for each creator
     - Stores mapping: `creatorId → totalAmount`
   - Stores `readsByCreator` mapping for traceability

3. **Draft Batch Management**:
   - System checks for existing draft batch
   - If exists, validates reads are still unsettled
   - If reads already settled, deletes invalid draft
   - Returns existing draft or creates new one

#### 5.2.2 Distribution Phase

1. **Pre-Distribution Validation**:
   - Verifies batch status is "draft"
   - Checks batch hasn't been distributed
   - Validates all reads in batch are still unsettled
   - Ensures all reads are valid
   - Confirms all reads exist in database

2. **Creator Wallet Resolution**:
   - Fetches creator documents
   - Extracts wallet addresses
   - Builds arrays: `addresses[]` and `amounts[]`
   - Validates wallets exist and amounts are positive

3. **Blockchain Distribution**:
   - Calls vault `distribute()` function with arrays
   - Single transaction distributes to all creators
   - Platform fee calculated and deducted
   - Transaction hash recorded

4. **Read Marking**:
   - Marks all reads as settled atomically:
     - Updates `settlementBatchId` on each read
     - Sets `settledAt` timestamp
   - Uses conditional update to prevent double-settlement
   - Verifies all reads were successfully marked

5. **Batch Finalization**:
   - Updates batch status to "distributed"
   - Records transaction hash
   - Batch cannot be redistributed

### 5.3 Double-Settlement Prevention

**Multiple Layers of Protection:**

1. **Query-Level Filtering**:
   - Only selects reads without `settlementBatchId`
   - Double-filters in application code

2. **Draft Batch Validation**:
   - Checks existing draft batches for already-settled reads
   - Deletes invalid drafts automatically

3. **Pre-Distribution Checks**:
   - Verifies reads are unsettled right before distribution
   - Fetches current read state from database
   - Blocks distribution if any reads already settled

4. **Atomic Updates**:
   - Uses conditional `updateMany`:
     - Only updates if `settlementBatchId` is null/undefined
   - Verifies `modifiedCount` matches expected count
   - Returns error if update fails

5. **Status Checks**:
   - Batch status prevents re-distribution
   - Distributed batches cannot be redistributed

### 5.4 Admin Dashboard

**Settlement Controls:**
- "Run Daily Settlement" button
- Aggregates and distributes in one action
- Shows settlement history
- Displays recent settlement batches
- Shows creator payouts per batch

**Dashboard Metrics:**
- Total approved by all users
- Total used by all users
- Total deposited to vault
- Current vault balance (from blockchain)
- Recent approvals, deposits, credits, tips
- Collapsible sections for better UX

#### 5.4.1 Admin User Setup

To create an admin user and access the Admin Dashboard:

**Step 1: Configure Admin Setup Key**
1. Set `ADMIN_SETUP_KEY` in `server/.env`:
   ```env
   ADMIN_SETUP_KEY=your-secure-admin-setup-key-here
   ```
2. Restart the server

**Step 2: Create Admin User**
Make a POST request to `/auth/ensure-admin`:

```bash
POST http://localhost:4000/auth/ensure-admin
Content-Type: application/json

{
  "key": "your-secure-admin-setup-key-here",
  "email": "admin@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
- If user exists: Updates role to 'admin' and password
- If user doesn't exist: Creates new admin user

**Step 3: Login**
- Login with the admin credentials
- Access Admin Dashboard from navigation menu

---

## 6. Database Models

### 6.1 User Model
```javascript
{
  email: String (unique),
  passwordHash: String,
  role: 'user' | 'admin',
  wallet: String,
  dailyCap: Number,
  priceSensitivity: Number,
  spentToday: Number,
  bucket: 'morning' | 'afternoon' | 'evening',
  bucketSpent: { morning, afternoon, evening },
  preferences: { allowModes, like, block },
  approvedTotal: Number,
  approvedAllowance: Number,
  usedTotal: Number,
  depositedTotal: Number,
  pendingHold: Number
}
```

### 6.2 Creator Model
```javascript
{
  userId: ObjectId (ref: User),
  wallet: String,
  trustScore: Number,
  reputation: Number,
  menu: {
    perMinFloor: Number,
    perReadFloor: Number,
    suggestedPerMin: Number,
    suggestedPerRead: Number
  }
}
```

### 6.3 Post Model
```javascript
{
  creatorId: ObjectId (ref: Creator),
  title: String,
  slug: String (unique),
  coverUrl: String,
  category: String,
  length: 'short' | 'med' | 'long',
  authorReputation: Number,
  excerpt: String,
  content: String,
  published: Boolean
}
```

### 6.4 Reservation Model
```javascript
{
  userId: ObjectId (ref: User),
  postId: ObjectId (ref: Post),
  creatorId: ObjectId (ref: Creator),
  mode: 'per_minute' | 'per_read',
  rateOrPrice: Number,
  minMinutes: Number,
  capMinutes: Number,
  ttlSec: Number,
  expiresAt: Date,
  approvedAmount: Number,
  usedAmount: Number,
  usedMinutes: Number,
  status: 'active' | 'expired' | 'finalized'
}
```

### 6.5 Tick Model
```javascript
{
  reservationId: ObjectId (ref: Reservation),
  tickMs: Number,
  focus: Boolean,
  visibility: Number,
  scroll: Number,
  ts: Date
}
```

### 6.6 FinalizedRead Model
```javascript
{
  userId: ObjectId (ref: User),
  creatorId: ObjectId (ref: Creator),
  postId: ObjectId (ref: Post),
  mode: 'per_minute' | 'per_read',
  minutes: Number,
  reads: Number,
  debit: Number,
  valid: Boolean,
  refundReason: String,
  ts: Date,
  settlementBatchId: ObjectId (ref: SettlementBatch),
  settledAt: Date
}
```

### 6.7 SettlementBatch Model
```javascript
{
  date: String,
  totals: Object, // Map of creatorId → accumulated amount
  readsByCreator: Object, // Map of creatorId → array of read records
  txHash: String,
  status: 'draft' | 'distributed',
  csvUri: String
}
```

### 6.8 WalletApproval Model
```javascript
{
  userId: ObjectId (ref: User),
  amount: Number,
  txHash: String,
  chainId: String
}
```

### 6.9 WalletDeposit Model
```javascript
{
  userId: ObjectId (ref: User),
  amount: Number,
  txHash: String,
  chainId: String
}
```

### 6.10 Tip Model
```javascript
{
  senderId: ObjectId (ref: User),
  creatorId: ObjectId (ref: Creator),
  postId: ObjectId (ref: Post),
  amount: Number,
  message: String,
  inputType: 'text' | 'voice',
  txHash: String,
  chainId: String,
  status: 'pending' | 'completed' | 'failed',
  errorMessage: String
}
```

### 6.11 NegLog Model
```javascript
{
  negotiateId: String,
  userId: ObjectId (ref: User),
  postId: ObjectId (ref: Post),
  timeline: Array,
  agreedTerms: Object,
  ts: Date
}
```

---

## 7. API Endpoints

### 7.1 Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout

### 7.2 Posts
- `GET /posts` - List posts
- `GET /posts/:id` - Get post details
- `POST /posts` - Create post (creator)
- `PUT /posts/:id` - Update post (creator)
- `DELETE /posts/:id` - Delete post (creator)

### 7.3 Negotiation
- `GET /negotiate/context` - Get negotiation context
- `POST /negotiate/start` - Start negotiation
- `POST /negotiate/reservation` - Create reservation

### 7.4 Metering
- `POST /meter/tick` - Record reading tick
- `POST /meter/finalize` - Finalize reading session

### 7.5 Wallet
- `GET /wallet/summary` - Get wallet summary
- `POST /wallet/approve` - Record approval
- `POST /wallet/deposit` - Record deposit
- `POST /wallet/connect` - Connect wallet
- `POST /wallet/process` - Process wallet command (agent)

### 7.6 Tips
- `POST /tips/process` - Process tip request
- `POST /tips/confirm` - Confirm tip transaction
- `GET /tips/history` - Get tip history

### 7.7 Settlement
- `POST /aggregate_settlements` - Aggregate unsettled reads
- `POST /distribute_settlements` - Distribute settlement batch
- `GET /settlements/recent` - Get recent settlements

### 7.8 Admin
- `GET /admin/overview` - Get admin overview
- `GET /admin/stats` - Get platform statistics

### 7.9 Orchestrator
- `POST /orchestrator/process` - Process user command (route to agent)

---

## 8. Security Features

### 8.1 Authentication & Authorization
- JWT-based authentication
- Password hashing (bcrypt)
- Role-based access control (Admin/User)
- Protected routes middleware

### 8.2 Blockchain Security
- MetaMask integration for transaction signing
- Network validation (Arc Testnet only)
- Transaction verification
- Smart contract access control (owner-only functions)

### 8.3 Data Validation
- Input sanitization
- Amount validation (positive numbers)
- Wallet address validation
- ObjectId validation
- Schema validation with Mongoose

### 8.4 Settlement Security
- Double-settlement prevention (multiple layers)
- Atomic database updates
- Transaction verification
- Batch status checks
- Read state validation

---

## 9. Key Features & Innovations

### 9.1 AI-Powered Negotiation
- Automatic price negotiation between users and creators
- Context-aware pricing based on tips, popularity, trust
- Three-round negotiation with mediator
- Bias logic for fair pricing

### 9.2 Voice-Enabled Interactions
- Voice commands for wallet operations
- Voice tips with message transcription
- Eleven Labs integration for speech-to-text
- Fallback to text input if voice fails

### 9.3 Real-Time Metering
- Precise reading time tracking
- Focus/visibility detection
- Per-minute and per-read billing modes
- Automatic reservation extension
- Quality validation (anti-fraud)

### 9.4 Automated Settlement
- Batch aggregation of reads
- Single-transaction distribution
- Double-settlement prevention
- Platform fee calculation
- Comprehensive audit trail

### 9.5 Prepayment Model
- Users deposit funds into vault
- Approval system for spending control
- Pending hold mechanism
- Allowance tracking
- Withdrawal capability

---

## 10. Deployment & Configuration

### 10.0 Live Deployment

The application is now fully deployed and ready to use:

- **Client Application**: https://arcclient.vercel.app/
- **Server API**: https://arcserver-dun.vercel.app/
- **Agents Service**: https://arcagents.vercel.app/
- **Smart Contract (PayoutVault)**: `0x89741693b8Bf2EEc4cAe2DE2894F0340C5af7165` (Arc Testnet)

**Quick Start:**
1. Visit https://arcclient.vercel.app/
2. Connect MetaMask wallet (Arc Testnet - Chain ID: 5042002)
3. Register/Login and start using the platform
4. Test all features: wallet operations, reading posts, tipping creators, admin dashboard

**Network Configuration:**
- **Network**: Arc Testnet
- **Chain ID**: 5042002
- **Contract Address**: `0x89741693b8Bf2EEc4cAe2DE2894F0340C5af7165`

### 10.1 Environment Variables

**Server (`server/.env`):**
```
MONGO_URI=mongodb://localhost:27017/arc_micropayments
JWT_SECRET=your_jwt_secret
RPC_URL=your_arc_testnet_rpc_url
PRIVATE_KEY=your_private_key (for settlements)
VAULT_ADDRESS=your_vault_contract_address
USDC_ADDRESS=your_usdc_contract_address
AGENTS_BASE_URL=http://localhost:8000
```

**Client (`client/.env`):**
```
VITE_API_URL=http://localhost:4000
VITE_VAULT_ADDRESS=your_vault_contract_address
VITE_USDC_ADDRESS=your_usdc_contract_address
```

**Agents (`agents/.env`):**
```
GOOGLE_GEMINI_API_KEY=your_gemini_api_key
ELEVEN_LABS_API_KEY=your_eleven_labs_api_key
AGENTS_BASE_URL=http://localhost:8000
SERVER_BASE_URL=http://localhost:4000
PORT=8000
```

**Server (`server/.env`) - Additional Variables:**
```
ADMIN_SETUP_KEY=your-secure-admin-setup-key-here
```
- Required for creating admin users via `/auth/ensure-admin` endpoint (see Section 5.4.1)

### 10.2 Docker Deployment
```bash
docker compose build
docker compose up
```

### 10.3 Smart Contract Deployment

**Deployed Contract:**
- **Address**: `0x89741693b8Bf2EEc4cAe2DE2894F0340C5af7165`
- **Network**: Arc Testnet (Chain ID: 5042002)
- **Contract**: PayoutVault.sol

**For Local Deployment:**
```bash
cd foundry/hello-arc
forge build
forge script script/DeployVault.s.sol:DeployVault --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY --broadcast
```

### 10.4 Database Seeding
```bash
docker compose exec server npm run seed
```

---

## 11. Testing & Quality Assurance

### 11.1 Settlement Testing
- Double-settlement prevention tests
- Batch validation tests
- Read state verification
- Transaction failure handling

### 11.2 Agent Testing
- Voice transcription accuracy
- Intent extraction validation
- Negotiation term generation
- Fallback mechanism testing

### 11.3 Metering Testing
- Reading time accuracy
- Focus detection
- Billing calculation
- Reservation expiration

### 11.4 Integration Testing
- End-to-end reading flow
- Wallet operations
- Tip processing
- Settlement distribution

---

## 12. Future Enhancements

### 12.1 Planned Features
- Multi-chain support
- Advanced analytics dashboard
- Creator revenue sharing
- Subscription models
- Content recommendations
- Social features

### 12.2 Scalability Improvements
- Database indexing optimization
- Caching layer
- Rate limiting
- Load balancing
- CDN integration

### 12.3 Security Enhancements
- Multi-sig wallet support
- Audit logging
- Fraud detection algorithms
- Rate limiting per user
- IP-based restrictions

---

## 13. Conclusion

Arc Micropayments MVP is a comprehensive, production-ready platform that combines blockchain technology, AI agents, and real-time metering to enable fair and efficient content monetization. The system's robust architecture, security features, and innovative agent-based negotiation make it a compelling solution for decentralized content platforms.

The platform successfully implements:
- ✅ Secure smart contract vault for fund management
- ✅ AI-powered negotiation for dynamic pricing
- ✅ Voice-enabled interactions for better UX
- ✅ Real-time metering with quality validation
- ✅ Automated settlement with double-settlement prevention
- ✅ Comprehensive admin dashboard
- ✅ Role-based access control
- ✅ Blockchain integration with MetaMask

This system demonstrates the potential of combining traditional web technologies with blockchain and AI to create innovative monetization solutions for content creators.

---

## Appendix: Key Files Reference

### Smart Contracts
- `foundry/hello-arc/src/PayoutVault.sol` - Main vault contract

### Server Controllers
- `server/src/controllers/settlement/settlement.controller.js` - Settlement logic
- `server/src/controllers/negotiation/negotiation.controller.js` - Negotiation API
- `server/src/controllers/metering/meter.controller.js` - Metering logic
- `server/src/controllers/tips/tip.controller.js` - Tip processing
- `server/src/controllers/wallet/wallet.controller.js` - Wallet operations
- `server/src/controllers/admin/admin.controller.js` - Admin dashboard

### Agents
- `agents/src/negotiationAgent.js` - Negotiation agent
- `agents/src/tipAgent.js` - Tip agent
- `agents/src/walletAgent.js` - Wallet agent
- `agents/src/orchestratorAgent.js` - Orchestrator agent

### Frontend Pages
- `client/src/pages/HomePage.jsx` - Homepage
- `client/src/pages/PostPage.jsx` - Post reading interface
- `client/src/pages/WalletPage.jsx` - Wallet management
- `client/src/pages/CreatorPage.jsx` - Creator studio
- `client/src/pages/AdminDashboard.jsx` - Admin dashboard

### Models
- `server/src/models/index.js` - All database schemas

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Project**: Arc Micropayments MVP

