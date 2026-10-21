// Who is signed in, and the team directory (people + subteams) most screens need.
//
// Sign-in mode comes from GET /api/auth/config:
//   clerk  Clerk's widget; its short-lived session token is fetched fresh for every request.
//   dev    local development: pick a seeded user. The token lives in sessionStorage (this tab only).
//   off    nothing configured: say so instead of showing a broken sign-in.
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { get, post, setTokenSource, setUnauthorizedHandler } from '../lib/api'
import FullPageMessage from '../components/FullPageMessage'

const ClerkGate = lazy(() => import('./ClerkGate'))
const SessionContext = createContext(null)
export const useSession = () => useContext(SessionContext)

const DEV_KEY = 'hub302.devToken'

function TeamProvider({ onSignOut, children }) {
  const [user, setUser] = useState(null)
  const [users, setUsers] = useState([])
  const [subteams, setSubteams] = useState([])
  const [error, setError] = useState(null)

  const refreshTeam = useCallback(async () => {
    const [u, s] = await Promise.all([get('/users'), get('/subteams')])
    setUsers(u.users)
    setSubteams(s.subteams)
  }, [])

  useEffect(() => {
    let live = true
    get('/me')
      .then(async (d) => { if (!live) return; setUser(d.user); await refreshTeam() })
      .catch((e) => live && setError(e))
    return () => { live = false }
  }, [refreshTeam])

  const value = useMemo(() => ({
    user, setUser, users, subteams, refreshTeam, signOut: onSignOut,
    userById: Object.fromEntries(users.map((u) => [u.id, u])),
    subteamById: Object.fromEntries(subteams.map((s) => [s.id, s])),
  }), [user, users, subteams, refreshTeam, onSignOut])

  if (error) {
    return (
      <FullPageMessage title={error.status === 401 ? 'You’re not on the team roster yet' : 'Couldn’t load your account'}
        body={error.status === 401 ? 'You signed in, but no team member has this email. Ask a mentor to add you in Team, using the email you sign in with.' : error.message}
        action={<button className="btn-secondary" onClick={onSignOut}>Sign out</button>} />
    )
  }
  if (!user) return <FullPageMessage loading title="Loading 302 Hub…" />
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
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
    <FullPageMessage title="Development sign-in" body="Local only — production uses Clerk. Pick a team member to act as.">
      <div className="w-full max-w-sm space-y-2 text-left">
        {data?.users?.map((u) => (
          <button key={u.email} className="btn-secondary w-full justify-between" onClick={() => signIn(u.email)}>
            <span>{u.name}</span><span className="text-xs text-brand-gray-500">{u.role}</span>
          </button>
        ))}
        {data?.bootstrap_email && (
          <button className="btn-primary w-full" onClick={() => signIn(data.bootstrap_email)}>Set up as {data.bootstrap_email}</button>
        )}
        <form className="flex gap-2 pt-2" onSubmit={(e) => { e.preventDefault(); signIn(email) }}>
          <input className="input" placeholder="email@example.org" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
          <button className="btn-secondary">Go</button>
        </form>
        {error && <p className="text-sm text-status-danger">{error}</p>}
      </div>
    </FullPageMessage>
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

  if (configError) return <FullPageMessage title="Can’t reach 302 Hub" body={configError} />
  if (!config) return <FullPageMessage loading title="Loading…" />
  if (config.mode === 'off') {
    return <FullPageMessage title="Sign-in isn’t set up" body="A mentor needs to add the Clerk keys to this server (README → Deploy)." />
  }
  if (config.mode === 'clerk') {
    return (
      <Suspense fallback={<FullPageMessage loading title="Loading…" />}>
        <ClerkGate publishableKey={config.clerk_publishable_key}>
          {(signOut) => <TeamProvider onSignOut={signOut}>{children}</TeamProvider>}
        </ClerkGate>
      </Suspense>
    )
  }
  if (!devToken) return <DevLogin onToken={setDevToken} />
  return <TeamProvider key={devToken} onSignOut={devSignOut}>{children}</TeamProvider>
}
