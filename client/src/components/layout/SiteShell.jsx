import React, { useMemo, useState } from 'react'
import ToastContainer from '../common/ToastContainer.jsx'
import AppHeader from './AppHeader.jsx'
import UsageSummary from '../common/UsageSummary.jsx'
import useUsageSummary from '../../hooks/useUsageSummary.js'
import { SidebarProvider } from '../../context/SidebarContext.jsx'

export default function SiteShell({ children }){
  const { summary } = useUsageSummary()
  const [sidebarContent, setSidebarContent] = useState(null)
  const value = useMemo(() => ({ setSidebarContent }), [])
  return (
    <SidebarProvider value={value}>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <ToastContainer />
        <AppHeader />
        <main className="mx-auto flex w-full max-w-6xl gap-6 px-4 py-6">
          <div className="min-w-0 flex-1">{children}</div>
          <aside className="sticky top-[68px] hidden w-80 shrink-0 self-start lg:block">
            <div className="space-y-16">
              <UsageSummary summary={summary} />
              {sidebarContent}
            </div>
          </aside>
        </main>
      </div>
    </SidebarProvider>
  )
}
