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
      <div>
        <h1 className="text-3xl font-semibold text-white">Discover premium creator posts</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Pay only for what you read, with transparent agent-negotiated pricing and automated vault safety checks.
        </p>
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
