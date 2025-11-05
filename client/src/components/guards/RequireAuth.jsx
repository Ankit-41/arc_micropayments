import React, { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '../../store/auth.js'

export default function RequireAuth({ children }){
  const location = useLocation()
  const { token, user, fetchMe } = useAuthStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function ensure(){
      if(!token){
        setChecking(false)
        return
      }
      if(user){
        setChecking(false)
        return
      }
      await fetchMe()
      if(!cancelled){
        setChecking(false)
      }
    }
    ensure()
    return () => {
      cancelled = true
    }
  }, [token, user, fetchMe])

  if(checking){
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-300">Checking session…</div>
  }

  if(!token || !user){
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />
  }

  return children
}
