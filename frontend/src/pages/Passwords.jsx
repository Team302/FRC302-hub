// Team passwords live in Vaultwarden (a self-hosted, Bitwarden-compatible password manager), not
// in the hub. This page says where, and how to get in. README → Passwords has the setup.
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
      <PageHeader title="Passwords" subtitle="Shared team logins: Onshape, the FIRST dashboard, social accounts, shop Wi-Fi." />
      {!url ? (
        <div className="card">
          <EmptyState icon={KeyRound} title="The team password manager isn’t set up yet"
            message={atLeast(user, 'admin') ? 'Set up Vaultwarden (README → Passwords), then set PASSWORDS_URL in wrangler.toml and deploy. This page will link to it.' : 'Until it is, ask a mentor for any login you need. Don’t share passwords in group chats.'} />
        </div>
      ) : (
        <div className="space-y-5 max-w-3xl">
          <div className="card p-6 flex flex-wrap items-center gap-4">
            <KeyRound className="w-6 h-6 text-accent-600 shrink-0" />
            <div className="flex-1 min-w-[220px]">
              <p className="font-semibold">The team’s passwords are in the team password manager</p>
              <p className="text-sm text-brand-gray-600 mt-0.5">You see the logins for your subteam. No account yet? Ask a mentor to invite you.</p>
            </div>
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primary"><ExternalLink className="w-4 h-4" />Open passwords</a>
          </div>
          <section className="card p-6">
            <h2 className="text-[15px] font-semibold mb-3">Use it on your phone and in your browser</h2>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-brand-gray-600">
              <li>Install the free <b className="text-brand-black">Bitwarden</b> app (App Store or Google Play) or browser extension. It works with the team’s server.</li>
              <li>On the sign-in screen, choose <b className="text-brand-black">Self-hosted</b> (under “Logging in on”) and enter <code className="px-1.5 py-0.5 rounded bg-brand-gray-100 text-brand-black text-[13px]">{host}</code></li>
              <li>Sign in with the email and master password you set when you accepted the invite.</li>
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
