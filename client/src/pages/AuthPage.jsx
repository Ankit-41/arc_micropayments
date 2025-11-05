import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/auth.js'

export default function AuthPage(){
  const navigate = useNavigate()
  const location = useLocation()
  const { signin, signup, loading } = useAuthStore()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('reader@example.com')
  const [password, setPassword] = useState('password')
  const [error, setError] = useState(null)

  async function handleSubmit(e){
    e.preventDefault()
    try {
      setError(null)
      if(mode === 'signin'){
        await signin(email, password)
      } else {
        await signup(email, password)
      }
      const redirectTo = location.state?.from || '/'
      navigate(redirectTo, { replace: true })
    } catch (err){
      setError(err.response?.data?.error || 'Authentication failed')
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-8">
      <h1 className="text-2xl font-semibold text-white">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
      <p className="text-sm text-slate-400">
        Every account can read and publish posts. Switch between reading and creating anytime.
      </p>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-slate-300">Email address</span>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-slate-300">Password</span>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
            required
          />
        </label>
        {error && <div className="rounded-lg bg-rose-500/20 px-3 py-2 text-sm text-rose-200">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Processing…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>
      <div className="text-sm text-slate-400">
        {mode === 'signin' ? (
          <button className="text-emerald-300 hover:text-emerald-200" onClick={() => setMode('signup')}>
            Need an account? Sign up
          </button>
        ) : (
          <button className="text-emerald-300 hover:text-emerald-200" onClick={() => setMode('signin')}>
            Already registered? Sign in
          </button>
        )}
      </div>
    </div>
  )
}
