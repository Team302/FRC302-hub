// Who is signed in, plus what most screens share: the people and subteams directory, the board
// list (sidebar, search, "New task"), the unread inbox count, and the global "New …" dialogs.
//
// Sign-in mode comes from GET /api/auth/config:
//   clerk  Clerk's widget; its short-lived session token is fetched fresh for every request.
//   dev    local development: pick a seeded user. The token lives in sessionStorage (this tab only).
//   off    nothing configured: say so instead of showing a broken sign-in.
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { get, post, setTokenSource, setUnauthorizedHandler } from '../lib/api'
import { ROLE } from '../lib/constants'
import FullPageLoader from '../components/brand/FullPageLoader'
import SignInLayout from '../components/brand/SignInLayout'
import QuickCreate from '../components/QuickCreate'
import Avatar from '../components/ui/Avatar'

const ClerkGate = lazy(() => import('./ClerkGate'))
const SessionContext = createContext(null)
export const useSession = () => useContext(SessionContext)

const DEV_KEY = 'hub302.devToken'
const INBOX_POLL_MS = 30000

function TeamProvider({ onSignOut, children }) {
  const [user, setUser] = useState(null)
  const [users, setUsers] = useState([])
  const [subteams, setSubteams] = useState([])
  const [boards, setBoards] = useState([])
  const [unread, setUnread] = useState(0)
  const [newType, setNewType] = useState(null)
  const [error, setError] = useState(null)

  const refreshTeam = useCallback(async () => {
    const [u, s] = await Promise.all([get('/users'), get('/subteams')])
    setUsers(u.users)
    setSubteams(s.subteams)
  }, [])
  const refreshBoards = useCallback(() => get('/boards').then((d) => setBoards(d.boards)).catch(() => {}), [])
  const refreshUnread = useCallback(() => get('/notifications').then((d) => setUnread(d.unread)).catch(() => {}), [])

  useEffect(() => {
    let live = true
    get('/me')
      .then(async (d) => { if (!live) return; setUser(d.user); await Promise.all([refreshTeam(), refreshBoards(), refreshUnread()]) })
      .catch((e) => live && setError(e))
    return () => { live = false }
  }, [refreshTeam, refreshBoards, refreshUnread])

  useEffect(() => {
    if (!user) return undefined
    const tick = () => { if (document.visibilityState === 'visible') refreshUnread() }
    const t = setInterval(tick, INBOX_POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [user, refreshUnread])

  const value = useMemo(() => ({
    user, setUser, users, subteams, boards, unread, setUnread,
    refreshTeam, refreshBoards, refreshUnread, signOut: onSignOut, openNew: setNewType,
    userById: Object.fromEntries(users.map((u) => [u.id, u])),
    subteamById: Object.fromEntries(subteams.map((s) => [s.id, s])),
  }), [user, users, subteams, boards, unread, refreshTeam, refreshBoards, refreshUnread, onSignOut])

  if (error) {
    const notOnTeam = error.status === 401
    return (
      <SignInLayout heading={notOnTeam ? 'You’re not on the team yet' : 'Couldn’t load your account'}
        subheading={notOnTeam ? 'You signed in, but no team member has this email. Ask a mentor to add you under People, using the email you sign in with.' : error.message}>
        <button className="btn-secondary w-full" onClick={onSignOut}>Sign out</button>
      </SignInLayout>
    )
  }
  if (!user) return <FullPageLoader label="Loading Team 302…" />
  return (
    <SessionContext.Provider value={value}>
      {children}
      <QuickCreate type={newType} onClose={() => setNewType(null)} />
    </SessionContext.Provider>
  )
}

function DevLogin({ onToken }) {
  const [data, setData] = useState(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { get('/auth/dev-users').then(setData).catch((e) => setError(e.message)) }, [])
  const signIn = async (address) => {
    setError('')
    try {
      const { token } = await post('/auth/dev-login', { email: address })
      sessionStorage.setItem(DEV_KEY, token)
      onToken(token)
    } catch (e) { setError(e.message) }
  }
  return (
    <SignInLayout heading="Sign in" subheading="Development mode. Choose a team member to sign in as.">
      <div className="space-y-4">
        <div className="card divide-y divide-brand-gray-100 max-h-[22rem] overflow-y-auto">
          {data?.users?.map((u) => (
            <button key={u.email} type="button" onClick={() => signIn(u.email)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-brand-gray-50 transition-colors">
              <Avatar name={u.name} size="md" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-brand-black truncate">{u.name}</span>
                <span className="block text-xs text-brand-gray-500 truncate">{u.email}</span>
              </span>
              <span className="badge-gray">{ROLE[u.role]?.label}</span>
            </button>
          ))}
          {data?.bootstrap_email && (
            <button type="button" onClick={() => signIn(data.bootstrap_email)} className="w-full px-4 py-3 text-left hover:bg-brand-gray-50">
              <span className="block text-sm font-medium">Set up as {data.bootstrap_email}</span>
              <span className="block text-xs text-brand-gray-500">First mentor account (BOOTSTRAP_ADMIN_EMAIL)</span>
            </button>
          )}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); signIn(email) }}>
          <input className="input" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" />
          <button className="btn-secondary shrink-0">Continue</button>
        </form>
        {error && <p className="text-sm text-status-danger" role="alert">{error}</p>}
      </div>
    </SignInLayout>
  )
}

export function SessionProvider({ children }) {
  const [config, setConfig] = useState(null)
  const [configError, setConfigError] = useState('')
  const [devToken, setDevToken] = useState(() => { try { return sessionStorage.getItem(DEV_KEY) } catch { return null } })

  useEffect(() => { get('/auth/config').then(setConfig).catch((e) => setConfigError(e.message)) }, [])

  const devSignOut = useCallback(() => {
    try { sessionStorage.removeItem(DEV_KEY) } catch { /* ignore */ }
    setDevToken(null)
  }, [])

  // Installed during render, not in an effect: child effects (TeamProvider's first /me) run
  // before this component's effects, and would otherwise go out with no token.
  const devTokenRef = useRef(devToken)
  devTokenRef.current = devToken
  if (config?.mode === 'dev') {
    setTokenSource(async () => devTokenRef.current)
    setUnauthorizedHandler((d) => { if (d?.code === 'unauthenticated') devSignOut() })
  }

  if (configError) {
    return <SignInLayout heading="Can’t reach the server" subheading={`${configError} If you’re running locally, check that \`npm run dev\` started both the worker and the app.`} />
  }
  if (!config) return <FullPageLoader />
  if (config.mode === 'off') {
    return <SignInLayout heading="Sign-in isn’t set up" subheading="The server has no Clerk keys yet. See README → Deploying to Cloudflare." />
  }
  if (config.mode === 'clerk') {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <ClerkGate publishableKey={config.clerk_publishable_key}>
          {(signOut) => <TeamProvider onSignOut={signOut}>{children}</TeamProvider>}
        </ClerkGate>
      </Suspense>
    )
  }
  if (!devToken) return <DevLogin onToken={setDevToken} />
  return <TeamProvider key={devToken} onSignOut={devSignOut}>{children}</TeamProvider>
}
