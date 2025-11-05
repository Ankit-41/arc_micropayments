import create from 'zustand'
import client, { setClientAuthToken } from '../api/client.js'

function loadPersisted(){
  if(typeof window === 'undefined') return { token: null, user: null }
  try {
    const raw = window.localStorage.getItem('auth-state')
    if(!raw) return { token: null, user: null }
    const parsed = JSON.parse(raw)
    return { token: parsed.token || null, user: parsed.user || null }
  } catch (err){
    console.warn('Failed to load auth state', err)
    return { token: null, user: null }
  }
}

function persistState(state){
  if(typeof window === 'undefined') return
  window.localStorage.setItem('auth-state', JSON.stringify({ token: state.token, user: state.user }))
}

const initial = loadPersisted()
if(initial.token){
  setClientAuthToken(initial.token)
}

const useAuthStore = create((set, get) => ({
  token: initial.token,
  user: initial.user,
  loading: false,
  setAuth(token, user){
    setClientAuthToken(token)
    const next = { token, user }
    persistState(next)
    set(next)
  },
  clearAuth(){
    setClientAuthToken(null)
    persistState({ token: null, user: null })
    set({ token: null, user: null })
  },
  async signin(email, password){
    set({ loading: true })
    try {
      const resp = await client.post('/auth/signin', { email, password })
      get().setAuth(resp.data.token, resp.data.user)
      return resp.data.user
    } finally {
      set({ loading: false })
    }
  },
  async signup(email, password){
    set({ loading: true })
    try {
      const resp = await client.post('/auth/signup', { email, password })
      get().setAuth(resp.data.token, resp.data.user)
      return resp.data.user
    } finally {
      set({ loading: false })
    }
  },
  async fetchMe(){
    if(!get().token) return null
    try {
      const resp = await client.get('/auth/me')
      if(resp.data.user){
        get().setAuth(get().token, resp.data.user)
        return resp.data.user
      }
      get().clearAuth()
      return null
    } catch (err){
      console.warn('Auth refresh failed', err)
      get().clearAuth()
      return null
    }
  },
  signout(){
    client.post('/auth/signout').catch(()=>{})
    get().clearAuth()
  },
  isAdmin(){
    return get().user?.role === 'admin'
  },
}))

export default useAuthStore
