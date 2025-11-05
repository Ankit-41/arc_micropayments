import axios from 'axios'

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

let authToken = null

export function setClientAuthToken(token){
  authToken = token || null
}

const client = axios.create({ baseURL: API_BASE_URL })

client.interceptors.request.use(config => {
  if(authToken){
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${authToken}`
  }
  return config
})

export default client
