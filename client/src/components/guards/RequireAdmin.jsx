import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '../../store/auth.js'
import RequireAuth from './RequireAuth.jsx'

export default function RequireAdmin({ children }){
  const location = useLocation()
  const { user } = useAuthStore()
  return (
    <RequireAuth>
      {user?.role === 'admin' ? children : <Navigate to="/" state={{ from: location.pathname }} replace />}
    </RequireAuth>
  )
}
