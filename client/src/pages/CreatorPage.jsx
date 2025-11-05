import React, { useState } from 'react'
import client from '../api/client.js'
import useAuthStore from '../store/auth.js'
import useToastStore from '../store/toast.js'
import RequireAuth from '../components/guards/RequireAuth.jsx'

const lengths = [
  { value: 'short', label: 'Short (quick read)' },
  { value: 'med', label: 'Medium' },
  { value: 'long', label: 'Long form' },
]

function CreatorForm(){
  const toast = useToastStore()
  const [title, setTitle] = useState('A new perspective on agent pricing')
  const [excerpt, setExcerpt] = useState('How we built explainable micropayments for Arc test chain users.')
  const [content, setContent] = useState('<p>Start writing your long-form insight here.</p>')
  const [category, setCategory] = useState('economy')
  const [length, setLength] = useState('med')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e){
    e.preventDefault()
    setSubmitting(true)
    try {
      const resp = await client.post('/posts', { title, excerpt, content, category, length })
      toast.push(`Post published: ${resp.data.post.title}`, 'success')
    } catch (err){
      console.error(err)
      toast.push(err.response?.data?.error || 'Failed to publish post', 'danger')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-slate-300">Title</span>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-slate-300">Category</span>
          <input
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
        </label>
      </div>
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-slate-300">Excerpt</span>
        <textarea
          value={excerpt}
          onChange={e => setExcerpt(e.target.value)}
          rows={3}
          className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-slate-300">Content (HTML)</span>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={10}
          className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 font-mono text-xs text-emerald-100 focus:border-emerald-500 focus:outline-none"
          required
        />
      </label>
      <div className="flex flex-wrap gap-4">
        {lengths.map(option => (
          <label key={option.value} className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="radio"
              name="length"
              value={option.value}
              checked={length === option.value}
              onChange={() => setLength(option.value)}
              className="h-4 w-4 border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400"
            />
            {option.label}
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Publishing…' : 'Publish post'}
      </button>
    </form>
  )
}

export default function CreatorPage(){
  const { user } = useAuthStore()
  return (
    <RequireAuth>
      <section className="flex flex-col gap-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h1 className="text-3xl font-semibold text-white">Creator studio</h1>
          <p className="mt-2 text-sm text-slate-400">
            Share your expertise. Pricing is negotiated automatically when readers open your posts.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <CreatorForm />
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
          <h2 className="text-lg font-semibold text-white">Need a wallet?</h2>
          <p className="mt-2">
            Connect your Arc testnet wallet from the Wallet tab so your payouts land in the right place. Your account {user?.email} can both read and create—no separate roles needed.
          </p>
        </div>
      </section>
    </RequireAuth>
  )
}
