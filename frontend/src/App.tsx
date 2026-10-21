/**
 * The application root: providers, routing and the signed out gate.
 *
 * The frame of the application is a layout route, so moving from one page
 * to the next keeps the sidebar and the page background in place. Only the
 * page inside the frame changes.
 */

import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './state/auth'
import { ToastProvider } from './state/toast'
import { TimelineProvider } from './state/timeline'
import { AppShell } from './components/layout/AppShell'
import { AuthPage } from './pages/AuthPage'
import { OverviewPage } from './pages/OverviewPage'
import { TimelinePage } from './pages/TimelinePage'
import { EditorPage } from './pages/EditorPage'
import { EntryPage } from './pages/EntryPage'
import { SearchPage } from './pages/SearchPage'
import { InsightsPage } from './pages/InsightsPage'
import { SettingsPage } from './pages/SettingsPage'
import { Spinner } from './components/ui'

/** The signed out gate. The page it came from is remembered. */
function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-6 text-ink-faint" />
      </div>
    )
  }
  if (!user) {
    return (
      <Navigate
        to="/signin"
        replace
        state={{ from: location.pathname + location.search + location.hash }}
      />
    )
  }
  return <Outlet />
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <TimelineProvider>
          <Routes>
            <Route path="/signin" element={<AuthPage mode="signin" />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />

            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<TimelinePage />} />
                <Route path="/overview" element={<OverviewPage />} />
                <Route path="/folders/:folderId" element={<TimelinePage />} />
                <Route path="/new" element={<EditorPage />} />
                <Route path="/entries/:entryId" element={<EntryPage />} />
                <Route path="/entries/:entryId/edit" element={<EditorPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/insights" element={<InsightsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/calendar" element={<Navigate to="/insights" replace />} />
                <Route path="/map" element={<Navigate to="/insights" replace />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </TimelineProvider>
      </ToastProvider>
    </AuthProvider>
  )
}
