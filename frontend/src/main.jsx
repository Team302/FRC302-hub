import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import '@fontsource-variable/inter'
import './styles.css'
import { SessionProvider, useSession } from './context/Session'
import { ToastProvider } from './context/ToastContext'
import { atLeast } from './lib/constants'
import AppShell from './components/layout/AppShell'
import Home from './pages/Home'
import Boards from './pages/Boards'
import Board from './pages/Board'
import Meetings from './pages/Meetings'
import Meeting from './pages/Meeting'
import Vault from './pages/Vault'
import Team from './pages/Team'
import Activity from './pages/Activity'
import MyWork from './pages/MyWork'
import Inbox from './pages/Inbox'
import Attendance from './pages/Attendance'
import Season from './pages/Season'
import Workload from './pages/Workload'

function RoleOnly({ role, children }) {
  const { user } = useSession()
  return atLeast(user, role) ? children : <Navigate to="/" replace />
}

// Push notifications and "install as an app" need the service worker (public/sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <SessionProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Home />} />
              <Route path="my-work" element={<MyWork />} />
              <Route path="inbox" element={<Inbox />} />
              <Route path="boards" element={<Boards />} />
              <Route path="boards/:id" element={<Board />} />
              <Route path="meetings" element={<Meetings />} />
              <Route path="meetings/:id" element={<Meeting />} />
              <Route path="vault" element={<Vault />} />
              <Route path="team" element={<Team />} />
              <Route path="activity" element={<RoleOnly role="admin"><Activity /></RoleOnly>} />
              <Route path="season" element={<Season />} />
              <Route path="workload" element={<RoleOnly role="lead"><Workload /></RoleOnly>} />
              <Route path="attendance" element={<RoleOnly role="lead"><Attendance /></RoleOnly>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </SessionProvider>
      </BrowserRouter>
    </ToastProvider>
  </React.StrictMode>,
)
