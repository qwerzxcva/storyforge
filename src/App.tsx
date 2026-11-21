import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router';

import { retiredHomeDestination } from './components/navigation/retired-routes';
import ResumeTracker from './components/home/ResumeTracker'

const AutoBackupStatusNotice = lazy(() => import('./components/system/AutoBackupStatusNotice'))
const HomePage = lazy(() => import('./pages/HomePage'))
const WorldEnginePage = lazy(() => import('./pages/WorldEnginePage'))
const LongformLibraryPage = lazy(() => import('./pages/LongformLibraryPage'))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'))
const SettingsRoutePage = lazy(() => import('./pages/SettingsRoutePage'))

function RouteFallback() {
  return <div className="min-h-screen bg-bg-base flex items-center justify-center text-sm text-text-muted">加载中…</div>
}

function HomeRoute() {
  const [params] = useSearchParams()
  const destination = retiredHomeDestination(params)
  return destination ? <Navigate replace to={destination}/> : <HomePage/>
}

export default function App() {
  return (
    <>
    <ResumeTracker/>
    <Suspense fallback={null}><AutoBackupStatusNotice/></Suspense>
    <Routes>
      <Route path="/home/:pageId?" element={<Suspense fallback={<RouteFallback />}><HomeRoute /></Suspense>}/>
      <Route path="/world/:pageId?" element={<Suspense fallback={<RouteFallback />}><WorldEnginePage /></Suspense>}/>
      <Route path="/" element={<Suspense fallback={<RouteFallback />}><HomeRoute /></Suspense>} />
      <Route path="/settings" element={<Suspense fallback={<RouteFallback />}><SettingsRoutePage /></Suspense>} />
      <Route path="/long" element={<Suspense fallback={<RouteFallback />}><LongformLibraryPage /></Suspense>} />
      <Route path="/workspace/:projectId" element={<Suspense fallback={<RouteFallback />}><WorkspacePage /></Suspense>} />
      <Route path="*" element={<Navigate replace to="/home/library" />} />
    </Routes>
    </>
  )
}
