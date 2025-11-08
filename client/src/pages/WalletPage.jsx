import React, { useCallback, useEffect, useState } from 'react'
import { ethers } from 'ethers'
import client from '../api/client.js'
import useAuthStore from '../store/auth.js'
import useToastStore from '../store/toast.js'
import RequireAuth from '../components/guards/RequireAuth.jsx'
import UsageSummary from '../components/common/UsageSummary.jsx'
// WalletVoiceButton is rendered globally in SiteShell
import { ERC20_ABI } from '../lib/erc20.js'

const USDC = import.meta.env.VITE_USDC_ADDRESS
const VAULT = import.meta.env.VITE_VAULT_ADDRESS

const VAULT_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

function useEthers(){
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [account, setAccount] = useState('')

  const connect = async () => {
    if(!window.ethereum) throw new Error('Install MetaMask')
    const nextProvider = new ethers.BrowserProvider(window.ethereum)
    await nextProvider.send('eth_requestAccounts', [])
    const nextSigner = await nextProvider.getSigner()
    const addr = await nextSigner.getAddress()
    setProvider(nextProvider)
    setSigner(nextSigner)
    setAccount(addr)
    return { provider: nextProvider, signer: nextSigner, address: addr }
  }

  return { provider, signer, account, connect }
}

function TabButton({ label, value, active, onSelect }){
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
        active ? 'bg-emerald-500 text-emerald-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
      }`}
    >
      {label}
    </button>
  )
}

function WalletContent({ data, refresh, loading }){
  const toast = useToastStore()
  const { user } = useAuthStore()
  const { account, connect } = useEthers()
  const [activeTab, setActiveTab] = useState('approve')
  const [amount, setAmount] = useState('10')
  const [symbol, setSymbol] = useState('USDC')
  const [decimals, setDecimals] = useState(6)
  const [processing, setProcessing] = useState(false)

  const walletAddress = user?.wallet || account

  // Check for pending tip and auto-fill amount (only once on mount)
  useEffect(() => {
    const pendingTipStr = sessionStorage.getItem('pendingTip')
    if(pendingTipStr){
      try {
        const pendingTip = JSON.parse(pendingTipStr)
        const neededAmount = pendingTip.amount
        setAmount(neededAmount.toString())
        toast.push(`Pending tip detected. Approve ${neededAmount} USDC to complete the tip.`, 'info')
      } catch (err){
        console.error('Error parsing pending tip:', err)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount


  async function ensureConnection(){
    const { signer } = await connect()
    if(!signer) throw new Error('Wallet connection failed')
    const erc = new ethers.Contract(USDC, ERC20_ABI, signer)
    try {
      const d = await erc.decimals()
      const s = await erc.symbol()
      setDecimals(Number(d))
      setSymbol(s)
    } catch (err){
      console.warn('Token introspection failed', err)
    }
    const addr = await signer.getAddress()
    await client.post('/wallet/connect', { address: addr })
    toast.push('Wallet connected', 'success')
    await refresh()
    return signer
  }

  async function handleApprove(){
    setProcessing(true)
    try {
      const signer = await ensureConnection()
      const erc = new ethers.Contract(USDC, ERC20_ABI, signer)
      const vault = new ethers.Contract(VAULT, VAULT_ABI, signer)
      
      // Get last approved amount and deposit it to vault before requesting new approval
      const lastApproval = data.approvals?.[0] // First item is most recent (sorted by createdAt desc)
      if(lastApproval && lastApproval.amount > 0){
        try {
          const lastApprovalAmount = lastApproval.amount
          toast.push(`Depositing ${lastApprovalAmount.toFixed(2)} ${symbol} from previous approval to vault...`, 'info')
          
          // Check balance before depositing
          const balanceOf = await erc.balanceOf(await signer.getAddress())
          const depositAmount = ethers.parseUnits(lastApprovalAmount.toString(), decimals)
          
          if(balanceOf < depositAmount){
            toast.push(`Insufficient balance to deposit ${lastApprovalAmount.toFixed(2)} ${symbol}. Proceeding with approval only.`, 'warning')
          } else {
            // Deposit last approved amount to vault
            const depositTx = await vault.deposit(depositAmount)
            const depositReceipt = await depositTx.wait()
            await client.post('/wallet/deposit', { 
              amount: lastApprovalAmount, 
              txHash: depositReceipt.hash, 
              chainId: depositTx.chainId?.toString?.() 
            })
            toast.push(`${lastApprovalAmount.toFixed(2)} ${symbol} deposited to vault`, 'success')
          }
        } catch (depositErr){
          // If deposit fails, log but continue with approval
          console.warn('Deposit of previous approval failed:', depositErr)
          toast.push('Could not deposit previous approval amount. Proceeding with approval...', 'warning')
        }
      }
      
      // Now proceed with the approval request
      const amt = ethers.parseUnits(amount, decimals)
      const tx = await erc.approve(VAULT, amt)
      const receipt = await tx.wait()
      await client.post('/wallet/approve', { amount: Number(amount), txHash: receipt.hash, chainId: tx.chainId?.toString?.() })
      toast.push('Allowance updated successfully', 'success')
      await refresh()
      
      // Check if there's a pending tip to complete
      const pendingTipStr = sessionStorage.getItem('pendingTip')
      if(pendingTipStr){
        const pendingTip = JSON.parse(pendingTipStr)
        const newSummary = await client.get('/wallet/summary')
        const availableAllowance = newSummary.data.summary?.availableAllowance || 0
        
        if(pendingTip.amount <= availableAllowance){
          // Now we can complete the tip
          try {
            toast.push('Completing pending tip transaction...', 'info')
            
            const provider = new ethers.BrowserProvider(window.ethereum)
            const signer = await provider.getSigner()
            const erc20 = new ethers.Contract(USDC, ERC20_ABI, signer)
            
            const decimals = await erc20.decimals()
            const amountInWei = ethers.parseUnits(pendingTip.amount.toString(), decimals)
            
            const tipTx = await erc20.transfer(pendingTip.creatorWallet, amountInWei)
            const tipReceipt = await tipTx.wait()
            
            await client.post('/tip/confirm', {
              tipId: pendingTip.tipId,
              txHash: tipReceipt.hash,
              chainId: tipTx.chainId?.toString(),
            })
            
            sessionStorage.removeItem('pendingTip')
            toast.push(`Tip of ${pendingTip.amount} USDC sent successfully! ${pendingTip.message ? `"${pendingTip.message}"` : ''}`, 'success')
            await refresh()
          } catch (tipErr){
            console.error('Tip completion error:', tipErr)
            if(tipErr.code !== 4001){
              toast.push('Approval successful but tip transaction failed. Please try again from the post page.', 'warning')
            }
          }
        }
      }
    } catch (err){
      console.error(err)
      toast.push(err.message || 'Approval failed', 'danger')
    } finally {
      setProcessing(false)
    }
  }

  async function handleDeposit(){
    setProcessing(true)
    try {
      const signer = await ensureConnection()
      const vault = new ethers.Contract(VAULT, VAULT_ABI, signer)
      const amt = ethers.parseUnits(amount, decimals)
      const tx = await vault.deposit(amt)
      const receipt = await tx.wait()
      await client.post('/wallet/deposit', { amount: Number(amount), txHash: receipt.hash, chainId: tx.chainId?.toString?.() })
      toast.push('Funds deposited into the vault', 'success')
      await refresh()
    } catch (err){
      console.error(err)
      toast.push(err.message || 'Deposit failed', 'danger')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-col gap-2">
          <span className="text-sm text-slate-400">Connected wallet</span>
          <div className="text-lg font-semibold text-white">{walletAddress || 'Not connected'}</div>
          <p className="text-sm text-slate-400">
            Link your Arc testnet wallet to sync approvals and deposits with your account.
          </p>
          <button
            type="button"
            onClick={ensureConnection}
            className="mt-3 w-fit rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
          >
            {walletAddress ? 'Reconnect wallet' : 'Connect wallet'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-wrap gap-2">
          <TabButton label="Approve allowance" value="approve" active={activeTab === 'approve'} onSelect={setActiveTab} />
          <TabButton label="Deposit to vault" value="deposit" active={activeTab === 'deposit'} onSelect={setActiveTab} />
        </div>
        <div className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-slate-300">Amount ({symbol})</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={activeTab === 'approve' ? handleApprove : handleDeposit}
            disabled={processing}
            className="w-fit rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processing ? 'Processing…' : activeTab === 'approve' ? 'Submit approval' : 'Deposit funds'}
          </button>
          <p className="text-xs text-slate-400">
            Approvals extend the amount agents can negotiate against. Deposits lock value into the vault once you approach 90% usage.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold text-white">Recent activity</h3>
        <p className="mt-2 text-sm text-slate-400">
          Approval and deposit history updates in real time as you interact with your wallet.
        </p>
        {loading ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="h-32 animate-pulse rounded-2xl bg-slate-900/50" />
            <div className="h-32 animate-pulse rounded-2xl bg-slate-900/50" />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-200">Latest approvals</h4>
              <ul className="mt-2 space-y-2 text-xs text-slate-400">
                {data.approvals.length
                  ? data.approvals.map(item => (
                    <li key={item.id} className="rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2">
                      <div className="font-medium text-slate-200">{Number(item.amount).toFixed(2)} {symbol}</div>
                      <div className="truncate">{item.txHash}</div>
                      <div>{new Date(item.createdAt).toLocaleString()}</div>
                    </li>
                  ))
                  : <li className="rounded-lg border border-dashed border-slate-800 px-3 py-2">No approvals yet.</li>}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-200">Latest deposits</h4>
              <ul className="mt-2 space-y-2 text-xs text-slate-400">
                {data.deposits.length
                  ? data.deposits.map(item => (
                    <li key={item.id} className="rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2">
                      <div className="font-medium text-slate-200">{Number(item.amount).toFixed(2)} {symbol}</div>
                      <div className="truncate">{item.txHash}</div>
                      <div>{new Date(item.createdAt).toLocaleString()}</div>
                    </li>
                  ))
                  : <li className="rounded-lg border border-dashed border-slate-800 px-3 py-2">No deposits yet.</li>}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function WalletPage(){
  const [data, setData] = useState({ summary: null, approvals: [], deposits: [] })
  const [loading, setLoading] = useState(true)
  const toast = useToastStore()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await client.get('/wallet/summary')
      setData({
        summary: resp.data.summary,
        approvals: resp.data.approvals || [],
        deposits: resp.data.deposits || [],
      })
      
      // Check if there's a pending tip to complete after approval
      const pendingTipStr = sessionStorage.getItem('pendingTip')
      if(pendingTipStr){
        const pendingTip = JSON.parse(pendingTipStr)
        const availableAllowance = resp.data.summary?.availableAllowance || 0
        
        // If now we have enough allowance, we can complete the tip
        // But wait for user to approve first, this will be handled in WalletContent
      }
    } catch (err){
      // If 404, user might not exist in DB yet - set empty data
      if(err.response?.status === 404){
        console.warn('Wallet summary not found - user may need to be initialized')
        setData({ summary: null, approvals: [], deposits: [] })
        return // Don't show error toast for 404
      }
      console.error(err)
      toast.push('Failed to load wallet summary', 'danger')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Voice button is global; no sidebar injection here

  return (
    <RequireAuth>
      <section className="flex flex-col gap-6">
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950/90 p-5 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-white mb-1.5">Wallet controls</h1>
              <p className="text-xs text-slate-300 leading-relaxed">
                Manage approvals and deposits for Arc testnet USDC. Connect your wallet to sync on-chain activity with account-level allowances.
              </p>
            </div>
          </div>
        </div>
        <WalletContent data={data} refresh={refresh} loading={loading} />
      </section>
    </RequireAuth>
  )
}
