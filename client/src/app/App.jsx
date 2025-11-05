import React from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import SiteShell from '../components/layout/SiteShell.jsx'
import AuthPage from '../pages/AuthPage.jsx'
import HomePage from '../pages/HomePage.jsx'
import PostPage from '../pages/PostPage.jsx'
import CreatorPage from '../pages/CreatorPage.jsx'
import WalletPage from '../pages/WalletPage.jsx'
import AdminDashboard from '../pages/AdminDashboard.jsx'

export default function App(){
  return (
    <BrowserRouter>
      <SiteShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/p/:slug" element={<PostPage />} />
          <Route path="/creator" element={<CreatorPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </SiteShell>
    </BrowserRouter>
  )
}
