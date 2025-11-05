import React from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/auth.js'

const linkClass = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition hover:bg-slate-800/70 ${
    isActive ? 'bg-slate-800/80 text-white' : 'text-slate-200'
  }`

export default function AppHeader(){
  const navigate = useNavigate()
  const { user, signout } = useAuthStore()
  const handleSignout = () => {
    signout()
    navigate('/auth')
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-semibold text-white">
          Arc Micropayments
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink to="/" className={linkClass} end>
            Home
          </NavLink>
          <NavLink to="/creator" className={linkClass}>
            Creator Studio
          </NavLink>
          {user && (
            <NavLink to="/wallet" className={linkClass}>
              Wallet
            </NavLink>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/admin" className={linkClass}>
              Admin
            </NavLink>
          )}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="text-right">
                <div className="text-sm font-medium text-white">{user.email}</div>
                <div className="text-xs uppercase tracking-wide text-slate-400">{user.role}</div>
              </div>
              <button
                type="button"
                onClick={handleSignout}
                className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-400"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
