// Team passwords don't live in the hub. Shared logins are on a Bitwarden-compatible server (a second
// Worker; deploy/passwords/); the most important ones stay with mentors. This page says where, and
// how to get in.
import { useEffect, useState } from 'react'
import { ExternalLink, KeyRound, ShieldCheck } from 'lucide-react'
import { get } from '../lib/api'
import { useSession } from '../context/Session'
import { atLeast } from '../lib/constants'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'

export default function Passwords() {
  const { user } = useSession()
  const [url, setUrl] = useState(undefined)
  useEffect(() => { get('/passwords').then((d) => setUrl(d.url)).catch(() => setUrl(null)) }, [])
  if (url === undefined) return null
  const host = url ? new URL(url).origin : null

  return (
    <div className="animate-fade-up">
      <PageHeader title="Passwords" subtitle="Where the team’s logins live, and how to get to yours." />
      {!url ? (
        <div className="card">
          <EmptyState icon={KeyRound} title="The team password manager isn’t set up yet"
            message={atLeast(user, 'admin') ? 'Set up the password server (deploy/passwords/README.md in the repo), then set PASSWORDS_URL in wrangler.toml and deploy. This page will link to it.' : 'Until it is, ask a mentor for any login you need. Don’t share passwords in group chats.'} />
        </div>
      ) : (
        <div className="space-y-5 max-w-3xl">
          <div className="card p-6 flex flex-wrap items-center gap-4">
            <KeyRound className="w-6 h-6 text-accent-600 shrink-0" />
            <div className="flex-1 min-w-[220px]">
              <p className="font-semibold">The team’s passwords are in the team password manager</p>
              <p className="text-sm text-brand-gray-600 mt-0.5">You see the logins for your subteam. No account yet? Ask a mentor; you’ll set it up together at a meeting.</p>
            </div>
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primary"><ExternalLink className="w-4 h-4" />Open passwords</a>
          </div>
          <section className="card p-6">
            <h2 className="text-[15px] font-semibold mb-3">What’s in there, and what isn’t</h2>
            <ul className="space-y-2 text-sm text-brand-gray-600">
              <li><b className="text-brand-black">In the team password manager:</b> shared logins for your subteam, like the shop Wi-Fi, vendor accounts and tool licences.</li>
              <li><b className="text-brand-black">Your own account instead:</b> Onshape, GitHub and the team’s social media give everyone their own login. Ask your lead to add you; don’t ask for a shared password.</li>
              <li><b className="text-brand-black">Mentors only:</b> the FIRST dashboard, money and school accounts. If you need something done there, ask a mentor.</li>
            </ul>
          </section>
          <section className="card p-6">
            <h2 className="text-[15px] font-semibold mb-3">Use it on your phone and in your browser</h2>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-brand-gray-600">
              <li>Install the free <b className="text-brand-black">Bitwarden</b> app (App Store or Google Play) or browser extension. It works with the team’s server.</li>
              <li>On the sign-in screen, choose <b className="text-brand-black">Self-hosted</b> (under “Logging in on”) and enter <code className="px-1.5 py-0.5 rounded bg-brand-gray-100 text-brand-black text-[13px]">{host}</code></li>
              <li>Sign in with the email and master password you chose when you made your account.</li>
            </ol>
            <p className="flex items-start gap-2 text-xs text-brand-gray-500 mt-4">
              <ShieldCheck className="w-4 h-4 shrink-0 text-accent-600" />
              Passwords are encrypted on your device with your master password; the server can’t read them. Nobody, including mentors, can recover a forgotten master password, so don’t lose it.
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
