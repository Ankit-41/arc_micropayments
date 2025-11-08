import React from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/auth.js'
import logo from '../../../public/mainlogo2.png'

const linkClass = ({ isActive }) =>
  `rounded-md px-2.5 py-1.5 text-xs font-medium transition hover:bg-slate-800/70 ${
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
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-2">
        {/* Logo - Left */}
        <Link to="/" className="flex items-center transition-opacity hover:opacity-80 flex-shrink-0">
          <img src={logo} alt="Arc Micropayments" className="h-8 w-auto object-contain" />
        </Link>

        {/* Navigation - Center */}
        <nav className="flex items-center justify-center gap-1.5 flex-1 px-6">
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

        {/* User Actions - Right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {user ? (
            <>
              <div className="text-right hidden sm:block">
                <div className="text-xs font-medium text-white">{user.email}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">{user.role}</div>
              </div>
              <button
                type="button"
                onClick={handleSignout}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-400 transition-colors"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
