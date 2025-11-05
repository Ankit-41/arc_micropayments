# Arc Micropayments MVP (Pattern B: User Prepay → Vault)

End-to-end MVP: server (Node/Express + Mongo), agents microservice (one-shot negotiation), client (React), and **Foundry** contracts for Arc Testnet.

## Quick Start (Docker)
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

USDC (test): set `VITE_USDC_ADDRESS` in `client/.env` and `USDC_ADDRESS` in `foundry/.env`.

## Wallet (Approve + Deposit)
Open **Wallet** page in the app and use **Approve + Deposit**. Make sure MetaMask is on **Arc Testnet (Chain ID 5042002)** and funded via faucet.

## Distributor
Set `RPC_URL`, `PRIVATE_KEY`, `VAULT_ADDRESS` in `server/.env`. Use Admin → **Run Daily Settlement** to call `vault.distribute()` (or mock if env not set).
