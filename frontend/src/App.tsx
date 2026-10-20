/**
 * The application root: providers, routing and the signed out gate.
 */

import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './state/auth'
import { ToastProvider } from './state/toast'
import { AppShell, NewEntryButton } from './components/layout/AppShell'
import { AuthPage } from './pages/AuthPage'
import { TimelinePage } from './pages/TimelinePage'
import { EditorPage } from './pages/EditorPage'
import { EntryPage } from './pages/EntryPage'
import { SearchPage } from './pages/SearchPage'
import { CalendarPage } from './pages/CalendarPage'
import { MapPage } from './pages/MapPage'
import { SettingsPage } from './pages/SettingsPage'
import { Spinner } from './components/ui'

/** The signed out gate. The page it came from is remembered. */
function RequireAuth({ children }: { children: ReactNode }) {
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
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

/** A page inside the application frame. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      {children}
      <NewEntryButton />
    </AppShell>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/signin" element={<AuthPage mode="signin" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Shell>
                  <TimelinePage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/folders/:folderId"
            element={
              <RequireAuth>
                <Shell>
                  <TimelinePage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/new"
            element={
              <RequireAuth>
                <Shell>
                  <EditorPage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/entries/:entryId"
            element={
              <RequireAuth>
                <Shell>
                  <EntryPage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/entries/:entryId/edit"
            element={
              <RequireAuth>
                <Shell>
                  <EditorPage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/search"
            element={
              <RequireAuth>
                <Shell>
                  <SearchPage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/calendar"
            element={
              <RequireAuth>
                <Shell>
                  <CalendarPage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/map"
            element={
              <RequireAuth>
                <Shell>
                  <MapPage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <Shell>
                  <SettingsPage />
                </Shell>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}
