import { lazy, useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './state/auth'
import { ToastProvider } from './state/toast'
import { JournalProvider } from './state/journal'
import { AppShell } from './shell/AppShell'
import { AuthPage } from './features/auth/AuthPage'
import { TimelinePage } from './features/timeline/TimelinePage'
import { EntryPage } from './features/entry/EntryPage'
import { ArchivePage } from './features/archive/ArchivePage'
import { SearchPage } from './features/search/SearchPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { Spinner } from './ui'

// The two heavy screens load on their own, and are fetched as soon as the
// journal is open so they are ready before they are needed.
const loadEditor = () => import('./features/editor/EditorPage')
const loadPlaces = () => import('./features/places/PlacesPage')
const EditorPage = lazy(() => loadEditor().then((module) => ({ default: module.EditorPage })))
const PlacesPage = lazy(() => loadPlaces().then((module) => ({ default: module.PlacesPage })))

function Gate() {
  const { user, checking } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (!user) return
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1200))
    idle(() => {
      void loadEditor()
      void loadPlaces()
    })
  }, [user])

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-3">
        <Spinner size={22} />
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <JournalProvider>
          <Routes>
            <Route path="/signin" element={<AuthPage mode="signin" />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />
            <Route element={<Gate />}>
              <Route element={<AppShell />}>
                <Route index element={<TimelinePage />} />
                <Route path="folder/:folderId" element={<TimelinePage />} />
                <Route path="entry/:entryId" element={<EntryPage />} />
                <Route path="entry/:entryId/edit" element={<EditorPage />} />
                <Route path="write" element={<EditorPage />} />
                <Route path="archive" element={<ArchivePage />} />
                <Route path="places" element={<PlacesPage />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </JournalProvider>
      </ToastProvider>
    </AuthProvider>
  )
}
