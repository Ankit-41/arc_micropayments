import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import client from '../api/client.js'

export default function HomePage(){
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load(){
      setLoading(true)
      try {
        const resp = await client.get('/posts')
        if(!cancelled){
          setPosts(resp.data.posts || [])
        }
      } finally {
        if(!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950/90 p-5 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2">
            <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-white mb-1.5">Discover premium creator posts</h1>
            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
              Pay only for what you read, with transparent agent-negotiated pricing and automated vault safety checks.
            </p>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-40 animate-pulse rounded-2xl bg-slate-900/50" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {posts.map(post => (
            <Link
              key={post._id}
              to={`/p/${post.slug}`}
              className="group flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-emerald-500/60 hover:bg-slate-900"
            >
              <div className="flex flex-col gap-3">
                <div className="text-xs uppercase tracking-wide text-emerald-400/80">{post.category}</div>
                <h2 className="text-xl font-semibold text-white group-hover:text-emerald-300">{post.title}</h2>
                <p className="text-sm text-slate-400">{post.preview}</p>
              </div>
              <div className="mt-4 text-xs uppercase tracking-wide text-slate-500">
                {new Date(post.createdAt).toLocaleDateString()} · {post.length?.toUpperCase()} read
              </div>
            </Link>
          ))}
          {posts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
              No posts yet. Head to the creator studio to publish your first entry.
            </div>
          )}
        </div>
      )}
    </section>
  )
}
