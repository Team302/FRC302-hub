// A one-page welcome for new students and their families, readable without signing in (it's sent
// before people have an account) and made to print on a single sheet for kickoff. Static text
// only: no API calls, nothing about the team's people or plans. The in-app Guide has the detail.
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { TeamLogo } from '../components/brand/BrandMark'

const B = ({ children }) => <b className="font-semibold text-brand-black">{children}</b>
// A label shown in the app; worker/test/guide.test.mjs checks it still exists.
const Btn = B

function Block({ title, children }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="text-base font-semibold text-brand-black mb-1.5">{title}</h2>
      <div className="text-sm text-brand-gray-600 space-y-1.5">{children}</div>
    </section>
  )
}

export default function Welcome() {
  // Always light: it's mostly printed, and a dark page prints badly. The reader's theme comes back
  // when they leave.
  useEffect(() => {
    const root = document.documentElement
    const wasDark = root.classList.contains('dark')
    root.classList.remove('dark')
    return () => { if (wasDark) root.classList.add('dark') }
  }, [])
  const address = window.location.origin.replace(/^https?:\/\//, '')
  return (
    <div className="min-h-screen bg-brand-gray-50 print:bg-white text-brand-black">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 print:py-0 print:px-0">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <TeamLogo height={48} tone="light" />
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome to 302 Hub</h1>
            <p className="text-sm text-brand-gray-500">A one-page guide for new students and their families</p>
          </div>
          <button type="button" className="btn-secondary print:hidden" onClick={() => window.print()}><Printer className="w-4 h-4" />Print</button>
        </div>

        <div className="card print:shadow-none print:border-0 p-6 sm:p-8 print:p-0 grid sm:grid-cols-2 print:grid-cols-2 gap-x-8 gap-y-6">
          <Block title="What it is">
            <p>The team’s own website for tasks, meetings, attendance hours, competitions and trips, shop equipment and
              expenses. Students use it every week; it replaces the spreadsheets and group-chat threads.</p>
          </Block>

          <Block title="Getting in">
            <p>A mentor adds your email to the team. Then go to <B>{address}</B> and sign in with that email.
              Nobody can make their own account.</p>
            <p>On a phone, add it to your Home Screen (iPhone: Safari → Share → <B>Add to Home Screen</B>; Android: Chrome
              menu → <B>Install app</B>), open it from there, and in <Btn>Inbox</Btn> press <Btn>Turn on</Btn> for
              notifications.</p>
          </Block>

          <Block title="Every week">
            <p><Btn>Check in</Btn> when you arrive: tap your name on the tablet by the shop door, or on your phone. Tap again
              when you leave. Hours count from check-in to check-out, and they’re what lettering and travel are based on.</p>
            <p><Btn>My work</Btn> lists the tasks you own. Keep their status up to date and post questions on the task.</p>
          </Block>

          <Block title="Competitions and trips">
            <p>Sign up for a trip in the hub under <Btn>Season</Btn>. If it’s full, you join a waitlist and get a
              notification when a place opens.</p>
            <p>Permission slips, trip fees and medical forms are still <B>on paper, to a mentor</B>. The hub only records
              that each one is in, and reminds you a week before the trip if something is missing.</p>
          </Block>

          <Block title="For parents and guardians: what it stores">
            <p>Your student’s name, email, subteam, the work they do and their hours. Not phone numbers, addresses,
              birthdays, photos, medical details or passwords. Other students can’t see their email address or their trip
              checklist; mentors and student leads can.</p>
            <p>Mentors can see a log of who changed what, and removing someone from the team cuts off their access
              straight away.</p>
          </Block>

          <Block title="Three rules">
            <p>1. Check in every time. 2. Never put a password in the hub, a task or a group chat; ask your lead how to
              get the login you need. 3. Ask a mentor <i>before</i> buying anything for the team, then log it under{' '}
              <Btn>Expenses</Btn> with a photo of the receipt.</p>
          </Block>
        </div>

        <p className="text-xs text-brand-gray-500 mt-5">Questions about the hub or a trip: ask one of the team’s mentors.
          Signed in already? The <Link to="/guide" className="link print:no-underline">full guide</Link> is in the hub’s sidebar.</p>
      </div>
    </div>
  )
}
