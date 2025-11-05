import { useCallback, useEffect, useState } from 'react'
import client from '../api/client.js'
import useAuthStore from '../store/auth.js'

export default function useUsageSummary(){
  const { user } = useAuthStore()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if(!user) return null
    setLoading(true)
    setError(null)
    try {
      const resp = await client.get(`/users/${user.id}/usage`)
      setSummary(resp.data.summary)
      return resp.data.summary
    } catch (err){
      console.error('Failed to load usage summary', err)
      setError(err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if(user){
      refresh()
    } else {
      setSummary(null)
    }
  }, [user, refresh])

  return { summary, refresh, loading, error }
}
