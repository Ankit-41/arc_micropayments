# Arc Micropayments MVP
End-to-end MVP: server (Node/Express + Mongo), agents microservice (one-shot negotiation), client (React), and **Foundry** contracts for Arc Testnet.

## 🌐 Live Deployment

The application is now deployed and ready to use! You can test all functionality directly without local setup:

- **Client Application**: https://arcclient.vercel.app/
- **Server API**: https://arcserver-dun.vercel.app/
- **Agents Service**: https://arcagents.vercel.app/
- **Contract Address**: `0x89741693b8Bf2EEc4cAe2DE2894F0340C5af7165` (Arc Testnet)

### Quick Test
1. Visit https://arcclient.vercel.app/
2. Connect your MetaMask wallet (Arc Testnet - Chain ID: 5042002)
3. Register/Login and start using the platform!

## Local Development Setup

If you want to run the application locally:

### Quick Start (Docker)
```bash
docker compose build
docker compose up
```
- Client: http://localhost:5173
- Server: http://localhost:4000
- Agents: http://localhost:8000

Seed demo data:
```bash
docker compose exec server npm run seed
```

## Foundry (Arc)
```bash
cd foundry
cp .env.example .env
# edit with ARC_TESTNET_RPC_URL, PRIVATE_KEY, USDC_ADDRESS, PLATFORM_FEE_WALLET, FEE_BPS
forge build
forge script script/DeployVault.s.sol:DeployVault --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY --broadcast
```
Copy the deployed **VAULT_ADDRESS** into:
- `server/.env` → `VAULT_ADDRESS`
- `client/.env` → `VITE_VAULT_ADDRESS`

**Note:** For the deployed version, the contract address is already configured: `0x89741693b8Bf2EEc4cAe2DE2894F0340C5af7165`

USDC (test): set `VITE_USDC_ADDRESS` in `client/.env` and `USDC_ADDRESS` in `foundry/.env`.

## Wallet (Approve + Deposit)

### Using the Deployed Application
1. Visit https://arcclient.vercel.app/
2. Navigate to the **Wallet** page
3. Connect your MetaMask wallet (Arc Testnet - Chain ID: 5042002)
4. Use **Approve + Deposit** to fund your account
5. Make sure your wallet is funded via Arc Testnet faucet

### Local Development
Open **Wallet** page in the app and use **Approve + Deposit**. Make sure MetaMask is on **Arc Testnet (Chain ID 5042002)** and funded via faucet.

## Admin Setup & Dashboard

### Creating an Admin User (Local Setup Required)

To access the Admin Dashboard and see the full functionality (including settlement distribution), you need to create an admin user. This must be done locally as it requires setting up the `ADMIN_SETUP_KEY` environment variable.

#### Step 1: Set up Admin Setup Key

1. Open `server/.env` file
2. Add the following environment variable:
   ```env
   ADMIN_SETUP_KEY=your-secure-admin-setup-key-here
   ```
3. Restart your server

#### Step 2: Create Admin User

Make a POST request to the `/auth/ensure-admin` endpoint:

**Using cURL:**
```bash
curl -X POST http://localhost:4000/auth/ensure-admin \
  -H "Content-Type: application/json" \
  -d '{
    "key": "your-secure-admin-setup-key-here",
    "email": "admin@example.com",
    "password": "SecurePassword123!"
  }'
```

**Using Postman:**
1. Create a new **POST** request
2. URL: `http://localhost:4000/auth/ensure-admin`
3. Go to **Body** tab → Select **raw** → Choose **JSON**
4. Paste the request body:
   ```json
   {
     "key": "your-secure-admin-setup-key-here",
     "email": "admin@example.com",
     "password": "SecurePassword123!"
   }
   ```
5. Click **Send**

**Note:** 
- The `key` must match the `ADMIN_SETUP_KEY` in your `server/.env` file
- If the user already exists, their role will be updated to 'admin' and password will be updated
- If the user doesn't exist, a new admin user will be created

#### Step 3: Login as Admin

1. Visit http://localhost:5173 (or your local client URL)
2. Login with the admin credentials you just created
3. Navigate to the **Admin Dashboard** to access:
   - Settlement aggregation and distribution
   - Platform statistics and metrics
   - Vault balance monitoring
   - Recent transactions (approvals, deposits, tips)

### Using the Admin Dashboard

Once logged in as admin:

1. Navigate to the **Admin Dashboard** from the navigation menu
2. View platform statistics (total approved, used, deposited, vault balance)
3. Use **Run Daily Settlement** to:
   - Aggregate all unsettled reads
   - Distribute payments to creators in batches
   - View settlement history

**Note:** For settlement distribution to work, ensure `RPC_URL`, `PRIVATE_KEY`, and `VAULT_ADDRESS` are set in `server/.env`. If not set, the system will use mock transactions for testing.
