// How to use the hub, by role. Opens on the reader's own role; the other roles are one tap away
// so a student can see what leads do and a new mentor can see what students see. Keep the steps in
// step with the button labels in the app: this page names them.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Bell, CalendarDays, ClipboardCheck, HelpCircle, KeyRound, Keyboard, LayoutGrid, ListChecks,
  MonitorSmartphone, Receipt, ShieldCheck, Smartphone, Trophy, Users, Wrench,
} from 'lucide-react'
import { useSession } from '../context/Session'
import FilterChips from '../components/ui/FilterChips'
import PageHeader from '../components/ui/PageHeader'

const B = ({ children }) => <b className="text-brand-black font-medium">{children}</b>

const GUIDES = {
  member: [
    {
      icon: Smartphone, title: 'Day one: put it on your phone', to: '/inbox', go: 'Inbox',
      steps: [
        <>iPhone: open the hub in <B>Safari</B> → Share → <B>Add to Home Screen</B>. Android: Chrome menu → <B>Install app</B>.</>,
        <>Open it from the Home Screen icon, go to <B>Inbox</B> and press <B>Turn on</B> to get notifications on this phone. On iPhone this only works from the Home Screen icon, not from Safari.</>,
        <>Want meetings and your due dates in your own calendar? Your initial (top right) → <B>Calendar feed</B>. The link is private; don’t share it.</>,
      ],
    },
    {
      icon: ListChecks, title: 'Your tasks', to: '/my-work', go: 'My work',
      steps: [
        <><B>My work</B> lists everything you own across all boards: overdue first, then today and the next 7 days.</>,
        <>Click a task to open it. Change its <B>status</B> as you go (Working on it, Stuck, Done). Stuck tells people you need help; say why in an update.</>,
        <>Post <B>updates</B> on the task instead of in a group chat, and type <B>@</B> and a name to bring someone in. Drag photos, PDFs or CAD exports onto the task to attach them.</>,
        <>If your task has a reviewer, press <B>Submit for review</B> when you’re done. They’ll approve it or ask for changes with a note. Some boards only let the reviewer, a lead or a mentor mark things Done.</>,
      ],
    },
    {
      icon: CalendarDays, title: 'Meetings and your hours', to: '/meetings', go: 'Meetings',
      steps: [
        <>When you arrive, tap your name on the <B>shop tablet</B> by the door, or open the meeting on your phone and press <B>Check in</B>.</>,
        <>Leaving early? Tap your name again on the tablet, or press <B>Leaving early? Check out</B>. Your hours count from check-in to check-out.</>,
        <>Your hours so far are on <B>Home</B>. They’re what counts for lettering and travel, so check in every time.</>,
      ],
    },
    {
      icon: Trophy, title: 'Competitions and trips', to: '/season', go: 'Season',
      steps: [
        <><B>Season</B> has kickoff, competitions, deadlines and outreach days with a countdown. During a competition, Home shows our rank and next match.</>,
        <>When sign-up opens for a trip, open the event and press <B>I’m going</B>. If it’s full you join the waitlist and get a notification when a place opens up.</>,
        <>Your checklist (permission slip, fee, forms) is on the same page. A mentor ticks those when they have them; hand the paper forms to a mentor, not the hub.</>,
        <>Can’t go after all? Press <B>Drop out</B> before sign-up closes so the next person gets your place. After that, tell a mentor.</>,
      ],
    },
    {
      icon: Wrench, title: 'Borrowing equipment', to: '/equipment', go: 'Equipment',
      steps: [
        <>Taking a drill, laptop or spare home or to another room? Find it in <B>Equipment</B> and press <B>Borrow</B>.</>,
        <><B>Return</B> it in the hub when you put it back, and say if it came back damaged. What you have out is at the top of the page under <B>You’re holding</B>.</>,
      ],
    },
    {
      icon: Receipt, title: 'Spent money for the team?', to: '/expenses', go: 'Expenses',
      steps: [
        <><B>Expenses</B> → <B>New expense</B>: amount, vendor, category, and a photo of the receipt. Say whether it was your own money so you get paid back.</>,
        <>A mentor approves or declines it (you’ll see why), then marks it paid back. Ask before you buy, not after.</>,
      ],
    },
    {
      icon: KeyRound, title: 'Logins', to: '/passwords', go: 'Passwords',
      steps: [
        <>The hub doesn’t store passwords. <B>Passwords</B> shows where the team’s shared logins are and how to get to your subteam’s.</>,
        <>Never paste a team password into a group chat or a task update.</>,
      ],
    },
  ],
  lead: [
    {
      icon: LayoutGrid, title: 'Set up your subteam’s board', to: '/boards', go: 'Boards',
      steps: [
        <>Sidebar → <B>+</B> next to Boards → pick a template (Robot build, Parts & purchasing, Competition prep, Outreach) and set its subteam.</>,
        <>Use <B>groups</B> for phases or subsystems, and add <B>columns</B> for what you track (est. hours, vendor, CAD link). Keep it small; every column is something people have to fill in.</>,
        <>Give tasks one <B>Owner</B> and a due date. Set a <B>Reviewer</B> on work that needs checking (a group can have a default reviewer), and turn on <B>Done needs approval</B> in board Settings if you want it enforced.</>,
        <><B>Automations</B> save chasing: “when Stuck, notify a mentor”, “when Done, move to Testing”.</>,
      ],
    },
    {
      icon: CalendarDays, title: 'Run a meeting', to: '/meetings', go: 'Meetings',
      steps: [
        <><B>Schedule meeting</B>, weekly if it repeats. Build the agenda: topics with an owner and minutes. It warns when the agenda is longer than the meeting.</>,
        <>Press <B>Start</B> at the start. Go topic by topic with the timer, take notes, record decisions, and add <B>action items</B>: they become real tasks on a board.</>,
        <>Attendance is one click per person, or let people check in on the kiosk. At the end, copy the <B>recap</B> into Discord or email.</>,
      ],
    },
    {
      icon: MonitorSmartphone, title: 'The shop tablet', to: '/meetings', go: 'Meetings',
      steps: [
        <><B>Meetings</B> → <B>Shop kiosk</B> → <B>Set up kiosk</B>, and open the link it gives you on the tablet by the door. It isn’t signed in as anyone and can only list names and record check-ins.</>,
        <>It shows check-in only while a meeting is running. Turn the link off if the tablet goes missing.</>,
      ],
    },
    {
      icon: Users, title: 'Keep an eye on the team', to: '/workload', go: 'Workload',
      steps: [
        <><B>Workload</B>: open, overdue and stuck tasks per person, and who has nothing. Reviews waiting on someone show there too.</>,
        <><B>Attendance</B>: hours and attendance rate per person for any date range; export it for lettering or travel eligibility.</>,
      ],
    },
    {
      icon: Trophy, title: 'Trips', to: '/season', go: 'Season',
      steps: [
        <>Open an event → <B>Sign-up settings</B>: open sign-up, set the number of student places and the last day to sign up.</>,
        <>You can add anyone (even past the cap), move people up from the waitlist, and add and tick checklist items like “safety glasses packed”. Permission slips, fees and medical forms are ticked by mentors.</>,
        <><B>Export CSV</B> gives the school or the bus company the list.</>,
      ],
    },
    {
      icon: Wrench, title: 'Equipment', to: '/equipment', go: 'Equipment',
      steps: [
        <>Add tools, laptops and spares with where they live. A bin of identical things is one row with a quantity.</>,
        <><B>Lend</B> to anyone and record any return. People get a reminder when they’re overdue; anything that comes back broken tells leads and mentors.</>,
      ],
    },
  ],
  admin: [
    {
      icon: ClipboardCheck, title: 'First week', to: '/', go: 'Home',
      steps: [
        <><B>Home</B> has a setup checklist that ticks itself off: add people, first board, meetings, season events, the password manager, notifications.</>,
        <><B>People</B>: add everyone by email and set their role and subteam. <B>Lead</B> is for student leads; <B>Mentor</B> sees everything, including mentor meetings and the audit log. Use at least two mentors.</>,
        <>With a Blue Alliance key set up, <B>Season</B> → <B>Import from TBA</B> adds every event the team is registered for.</>,
      ],
    },
    {
      icon: Receipt, title: 'Money', to: '/expenses', go: 'Expenses',
      steps: [
        <>Set a <B>budget per category</B> each season. Approve or decline expenses with a reason, then mark out-of-pocket ones <B>paid back</B>.</>,
        <>You can’t approve your own reimbursement when there’s another mentor. Export the season to CSV for the treasurer.</>,
      ],
    },
    {
      icon: Trophy, title: 'Trip paperwork', to: '/season', go: 'Season',
      steps: [
        <>Only mentors tick <B>mentor-only</B> items: anything a parent signs, and money. Tick them when you have the paper, not when a student says it’s coming.</>,
        <>Keep the forms with the school. Don’t type medical details or emergency contacts into notes; the hub is built not to hold them.</>,
      ],
    },
    {
      icon: ShieldCheck, title: 'Looking after the hub', to: '/activity', go: 'Audit log',
      steps: [
        <><B>Audit log</B> shows who did what. <B>Download backup</B> there at the end of each season and before big changes; keep it somewhere safe, it has names and emails.</>,
        <>When someone leaves: <B>People</B> → their name → <B>Remove from team</B> (it takes effect on their next click; reassign their tasks), remove them from the password manager, and change any shared password they could see.</>,
        <>Set up the team password manager from the repo’s <code className="text-[13px]">deploy/passwords/README.md</code>; keep money and identity logins in mentors’ own Bitwarden accounts.</>,
      ],
    },
  ],
}

const FAQ = [
  ['I can’t mark my task Done.', 'That board needs approval. Press Submit for review; your reviewer, a lead or a mentor marks it Done.'],
  ['I don’t get notifications on my phone.', 'Open the hub from the Home Screen icon (not the browser), go to Inbox and press Turn on. Check the phone’s settings allow notifications for it. Each phone or computer is turned on separately.'],
  ['I forgot to check in.', 'Ask whoever ran the meeting; they can mark you present on the meeting page.'],
  ['I can’t see a meeting someone mentioned.', 'Leadership meetings are for leads and mentors, and mentor meetings for mentors.'],
  ['I deleted a task by mistake.', 'Press Undo straight away, or ask a lead: deleted tasks stay in the board’s Trash for 30 days.'],
  ['Where do I put a password?', 'Not in the hub, not in a task, not in chat. Ask your lead; shared logins go in the team password manager.'],
]

const ROLE_TABS = [{ key: 'member', label: 'Students' }, { key: 'lead', label: 'Leads' }, { key: 'admin', label: 'Mentors' }]

function Section({ s, n }) {
  const Icon = s.icon
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl grid place-items-center bg-accent-500/10 text-accent-600 shrink-0"><Icon className="w-[18px] h-[18px]" /></span>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold pt-1.5"><span className="text-brand-gray-400 tabular-nums mr-1.5">{n}.</span>{s.title}</h2>
          <ol className="mt-3 space-y-2.5 text-sm text-brand-gray-600">
            {s.steps.map((step, i) => (
              <li key={i} className="flex gap-3"><span className="w-5 h-5 rounded-full bg-brand-gray-100 text-[11px] font-semibold text-brand-gray-600 grid place-items-center shrink-0 mt-px">{i + 1}</span><span className="min-w-0">{step}</span></li>
            ))}
          </ol>
          <Link to={s.to} className="link inline-flex items-center gap-1 text-sm mt-4">Go to {s.go}<ArrowRight className="w-3.5 h-3.5" /></Link>
        </div>
      </div>
    </section>
  )
}

export default function Guide() {
  const { user } = useSession()
  const [role, setRole] = useState(GUIDES[user?.role] ? user.role : 'member')
  const sections = GUIDES[role]
  const others = role !== 'member'

  return (
    <div className="animate-fade-up max-w-3xl">
      <PageHeader title="How to use 302 Hub" subtitle="The team’s tasks, meetings, hours, trips and gear in one place. Start with the part for your role." />
      <FilterChips className="mb-5" aria-label="Guide for" value={role} onChange={setRole} options={ROLE_TABS} />
      {others && <p className="text-sm text-brand-gray-500 mb-4">Everything in the Students guide applies to you too. This is what you do on top of it.</p>}
      <div className="space-y-4">
        {sections.map((s, i) => <Section key={s.title} s={s} n={i + 1} />)}
      </div>

      {role === 'member' && (
        <section className="card p-5 sm:p-6 mt-4">
          <h2 className="text-[15px] font-semibold flex items-center gap-2"><Keyboard className="w-4 h-4 text-brand-gray-400" />On a computer</h2>
          <p className="text-sm text-brand-gray-600 mt-2"><B>Ctrl K</B> (⌘K on a Mac) searches tasks, boards and meetings. <B>c</B> makes a new task. <B>g</B> then <B>w</B> jumps to My work, <B>g</B> then <B>i</B> to Inbox. Press <B>?</B> for the full list.</p>
        </section>
      )}

      <section className="card p-5 sm:p-6 mt-4">
        <h2 className="text-[15px] font-semibold flex items-center gap-2"><HelpCircle className="w-4 h-4 text-brand-gray-400" />Common questions</h2>
        <dl className="mt-3 divide-y divide-brand-gray-100">
          {FAQ.map(([q, a]) => (
            <div key={q} className="py-3">
              <dt className="text-sm font-medium">{q}</dt>
              <dd className="text-sm text-brand-gray-600 mt-0.5">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="flex items-start gap-2 text-xs text-brand-gray-500 mt-4 mb-2">
        <Bell className="w-4 h-4 shrink-0" />
        The hub keeps your name, email, subteam, the work you do and your hours. It doesn’t keep phone numbers, addresses, birthdays, medical details or passwords. Mentors can see the audit log of who changed what.
      </p>
    </div>
  )
}
