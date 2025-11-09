import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/auth.js'

export default function AuthPage(){
  const navigate = useNavigate()
  const location = useLocation()
  const { signin, signup, loading } = useAuthStore()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <div className="w-full max-w-md">
      {/* Logo Section */}
      <div className="mb-8 flex flex-col items-center">
        <img 
          src="/mainlogo2.png" 
          alt="Arc Micropayments" 
          className="h-16 w-auto object-contain mb-6"
        />
        <h1 className="text-3xl font-bold text-white mb-2">
          {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
        </h1>
        <p className="text-sm text-slate-400 text-center max-w-sm">
          {mode === 'signin' 
            ? 'Sign in to access your account and start reading premium content'
            : 'Join Arc Micropayments to read and publish premium content'
          }
        </p>
      </div>

      {/* Auth Form Card */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 to-slate-950/90 backdrop-blur-sm p-8 shadow-2xl">
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-lg border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
              required
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="rounded-lg border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 transition-all hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing…
              </span>
            ) : (
              mode === 'signin' ? 'Sign In' : 'Sign Up'
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-800">
          <div className="text-center text-sm text-slate-400">
            {mode === 'signin' ? (
              <>
                <span className="text-slate-500">Don't have an account? </span>
                <button 
                  className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors" 
                  onClick={() => {
                    setMode('signup')
                    setError(null)
                  }}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                <span className="text-slate-500">Already have an account? </span>
                <button 
                  className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors" 
                  onClick={() => {
                    setMode('signin')
                    setError(null)
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <p className="mt-6 text-center text-xs text-slate-500">
        Every account can read and publish posts. Switch between reading and creating anytime.
      </p>
    </div>
  )
}
