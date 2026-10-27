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
import Passwords from './pages/Passwords'
import Team from './pages/Team'
import Activity from './pages/Activity'
import MyWork from './pages/MyWork'
import Inbox from './pages/Inbox'
import Attendance from './pages/Attendance'
import Season from './pages/Season'
import Trip from './pages/Trip'
import Guide from './pages/Guide'
import Welcome from './pages/Welcome'
import Workload from './pages/Workload'
import Kiosk from './pages/Kiosk'
import Expenses from './pages/Expenses'
import Equipment from './pages/Equipment'

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
        <Routes>
          {/* The shop kiosk has no sign-in: its URL is its credential. */}
          <Route path="kiosk/:token" element={<Kiosk />} />
          {/* Printable welcome for new students and families, before they have an account. Static. */}
          <Route path="welcome" element={<Welcome />} />
          <Route path="*" element={<SignedIn />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </React.StrictMode>,
)

function SignedIn() {
  return (
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
          <Route path="passwords" element={<Passwords />} />
          <Route path="vault" element={<Navigate to="/passwords" replace />} />
          <Route path="team" element={<Team />} />
          <Route path="activity" element={<RoleOnly role="admin"><Activity /></RoleOnly>} />
          <Route path="season" element={<Season />} />
          <Route path="season/:id" element={<Trip />} />
          <Route path="guide" element={<Guide />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="equipment" element={<Equipment />} />
          <Route path="workload" element={<RoleOnly role="lead"><Workload /></RoleOnly>} />
          <Route path="attendance" element={<RoleOnly role="lead"><Attendance /></RoleOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SessionProvider>
  )
}
