# 302 Hub

Task boards, meetings, attendance, expenses and equipment for **FRC Team 302, Lake Orion Robotics (The Dragons)**.
Boards work like Monday.com. The app is built on ProjectPro's stack (Cloudflare Workers + D1 + React/Tailwind) and its
component library (app shell, top bar, modals, toasts, stat cards, charts), in the team's dragon green and flame red.

![Board](docs/screenshots/02-board-table.png)

| Home | Task panel |
|---|---|
| ![Home](docs/screenshots/01-home.png) | ![Task](docs/screenshots/09-item-panel.png) |
| **Kanban** | **Timeline** |
| ![Kanban](docs/screenshots/05-kanban.png) | ![Timeline](docs/screenshots/07-timeline.png) |
| **Meeting, live** | **Light theme** |
| ![Meeting](docs/screenshots/17-meeting-run.png) | ![Light](docs/screenshots/22-board-light.png) |

## What it does

**Boards.** One per subteam or project, started from a template: Robot build (Design → Fabrication → Assembly → Testing,
with Subsystem, Timeline, Est. hours, Parts ordered and CAD columns), Parts & purchasing (Requested → Approved →
Ordered → Received, with vendor, link, quantity, cost totals per group and tracking), Competition prep, Outreach, or blank.
- **Columns you define:** status labels, people (several per task), date, timeline, text, numbers, checkbox, tags, link.
  Every board also has Owner, Status, Priority and Due date. The statuses can be renamed per board, and Owner, Priority
  and Due date can be hidden.
- **Groups** with a summary row under each: status mix, date range, number totals, checkbox counts, who's involved.
- **Subitems** under any task, with the same columns.
- **Drag and drop** to reorder tasks or move them between groups. Bulk-select to change status or owner, move,
  duplicate or delete.
- **Search, person filter, filters** (status, priority, overdue, due this week, no date) and **sort** by any column.
- **Views:** Main table, Kanban (lanes by status or any status column), Calendar (drag to reschedule), Timeline/Gantt,
  and Chart (status mix, open tasks per person and per group).
- **Task panel:** every field, an updates thread with **@mentions**, subitems, **files** (part photos, PDFs, CAD
  exports; drag and drop, up to 15 MB each, stored in Cloudflare R2), and a full **history** of who changed what.
- **Automations:** "when status changes to Done, move it to Testing", "when Stuck, notify a mentor", "when a task is
  created, assign it to …". Loops are capped.
- **Favorites** pin boards to the top of the sidebar.
- **Reviews.** Every task can have a **Reviewer** besides its Owner: any lead or mentor, or someone on the task's
  subteam (the board's subteam; on a board without one, the owner's). A group can set a default reviewer for new tasks.
  The owner clicks **Submit for review**; the reviewer gets notified and the task is in their **Waiting for your
  review** list on My work (with a count in the sidebar). They **Approve** (Done, with the sign-off recorded) or
  **Request changes** (back to Working on it, with their note posted as an update). Workload shows how many reviews
  each person has waiting. A review that has waited 2 days gets the reviewer a reminder once a day until it's
  handled; from 4 days, the subteam's leads (or the mentors, if it has none) are told too.
- **Done needs approval** (per board, in Settings, off by default): only the task's reviewer, a lead or a mentor can
  mark it Done. The server enforces it for table edits, bulk edits, automations and new tasks. The owner can't be their
  own reviewer, and on these boards a member can't make themselves the reviewer of someone else's task. Done is
  greyed out in the status picker for anyone who can't use it, with the reason.
- **Trash with Undo.** Deleting a task (or a bulk selection) shows an Undo; deleted tasks wait in the board's Trash for
  30 days with their subitems, values, updates and files, then the hourly job removes them for good. A lead, the task's
  creator, or whoever deleted it can restore it. Deleting a group or a board is still immediate.
- **Export to CSV** (the download button on any board): every task and subitem with every visible column, for parts
  lists, sponsor and grant reports. Opens in Excel or Google Sheets; cells that look like formulas are defused.

**Inbox.** Notifications when you're assigned, added to a people column, @mentioned, when someone updates or changes the
status of a task you own, automation alerts, and due-date reminders (hourly job, once per task per day). The unread count
shows in the sidebar and on the top-bar bell.

**Install it like an app.** Add 302 Hub to a phone's Home Screen or install it from Chrome/Edge. Turn on
**push notifications** per device (Inbox → Turn on). Messages are encrypted end to end to the device (RFC 8291), so
Google/Apple/Mozilla's push services can't read them.

**Calendar feed.** Account menu → Calendar feed gives a private link for Google Calendar, Apple Calendar or Outlook:
team meetings you can see and your tasks with due dates.

**Attendance and hours** (leads and mentors). Hours and attendance rate per person from meetings run in the app
(from each person's check-in to check-out when they used the kiosk or their phone; the whole meeting when the runner
marked them),
for lettering, travel eligibility and grant reports. Filter by date range and subteam; export to CSV. Everyone sees
their own hours on Home.

**Season.** Kickoff, competitions, deadlines and outreach days with a countdown on everyone's Home; they're in the
calendar feed too. With a Blue Alliance key, **Import from TBA** adds every event the team is registered for (run it
again to pick up date or venue changes; a competition you'd already typed in is linked, not duplicated), and during an
event Home shows **rank, qual record, alliance, and the next and last match** with partners, opponents and the
predicted start time, refreshed every minute. The team number is `TEAM_NUMBER` in `wrangler.toml`.

**Trip rosters.** Any season event can have a sign-up list (Season → the event → Sign-up settings). Students sign
themselves up or drop out until sign-up closes; with a **cap**, later sign-ups join a **waitlist** and the first in
line is moved up, and told, when a place opens. The cap counts students; mentors on the list are chaperones and don't
take a place. Each trip has a **checklist** (permission slip, trip fee, medical and emergency form by default) that
leads and mentors tick per person; items marked *mentor-only*, which is anything a parent signs or money, can only be
ticked, changed or removed by a mentor. Everyone sees who's going; only the person and leads/mentors see their
checklist and note. **Export CSV** for the school's trip paperwork. The hub records *that* a form is in, never the
form: no medical details or emergency contacts. A week before the trip (once), everyone going with items still open is
told which, and the mentors get one summary. Removing someone from the team, or making them a mentor, moves the
waitlist up.

**Equipment.** Tools, laptops, robot spares and safety gear: what the team has, where it lives, its condition, and
who has it. A row can be a bin of identical things ("4 of 6 available"). Members **borrow** for themselves and return
their own; leads and mentors add and edit items, **lend** to anyone and record any return. Lending checks what's on the
shelf in one database statement, so two people can't take the last one. Retired and lost items can't go out. Coming
back damaged (needs repair, broken) updates the item and tells the leads and mentors; a few lost from a bin shrinks the
bin. Overdue borrowers get a reminder once a day. **You're holding** at the top of the page lists what you have out.
An item someone still has can't be deleted, only retired. Leads can export the list to CSV.

**Workload** (leads and mentors). Open, overdue, due-this-week and stuck tasks per person across every board, with
who has nothing assigned.

**On phones,** boards show as cards (tap the status to change it) with a switch to the full table.

**Keyboard shortcuts:** `c` new task, `/` search, `g` then `h`/`w`/`i`/`b`/`m`/`s`/`v`/`p` to jump, `?` for the list.

**Shop kiosk** (leads: Meetings → Shop kiosk). A link to open on a tablet by the shop door. While a build session,
general or subteam meeting is running, students find their name (first name + last initial), tap it, confirm, and
they're checked in, on time or late. Leaving early, they tap their name again to **check out** (or use "Leaving early? Check
  out" on the meeting page); coming back, they tap once more. The tablet isn't signed in as anyone: the link can only list names and record
check-ins, never shows leadership or mentor meetings, and stores nothing on the tablet. Every kiosk check-in is labelled
with the kiosk it came from on the meeting page, and the person running the meeting can change any of them. Links last
120 days and can be turned off at any time. The screen stays awake while the kiosk page is open (where the browser
allows it).

**Expenses.** Anyone submits what they spent for the team: amount, vendor, category, whether it was the team's money
or their own, and a photo or PDF of the receipt. Mentors approve or decline (with a reason the person sees), then mark
out-of-pocket expenses as paid back. Mentors set a budget per category for each season (Aug 1 to Jul 31, named for the
kickoff year); leads and mentors see budget vs spent vs waiting for review, and who is owed money, and can export the
season to CSV for the treasurer. Members see only their own expenses. A mentor can't approve their own reimbursement when
there's another mentor, and every decision is in the audit log.

**Recurring meetings.** Schedule a weekly series (up to 52) with the same agenda; delete the rest of a series in one go.

**My work.** Every open task and subitem you own across all boards, grouped into Overdue, Today, Next 7 days and later.

**Search (⌘K / Ctrl K).** Tasks, boards and meetings you can see.

**Meetings.** *Agenda:* topics with an owner and a time limit; it warns when the agenda runs longer than the meeting, and you
can copy last week's. *Run:* one topic at a time with a countdown that turns red on overtime, notes per topic, one-click
attendance, decisions, and action items that are created as real tasks on a board. Members check themselves in.
*Recap:* a Markdown summary to paste into Slack, Discord or email, or print.

**Passwords.** The hub doesn't store passwords. Team logins (Onshape, the FIRST dashboard, social accounts, shop
Wi-Fi) live in a Bitwarden-compatible server on a second Worker (most important logins stay with mentors). The Passwords
page links there and shows how to set up the app. See [Passwords](#passwords).

**Backup** (mentors). Audit log → Download backup: boards, tasks, values, updates, history, meetings, attendance, events,
the roster, expenses, equipment and the audit log as one JSON file. Push subscriptions and calendar links are **not**
in it; file attachments are listed but not included. Every download is in the audit log.
There is no restore-from-backup button yet; it's a copy for safekeeping and for moving data elsewhere.

**Guide** (sidebar → Guide). How to use the hub, with a tab each for students, leads and mentors (it opens on yours),
short steps that name the actual buttons, a link to each page, and common questions. Home shows a "New here?" card
until it's dismissed on that device. Update `frontend/src/pages/Guide.jsx` when a button label changes.

**Setup checklist.** Mentors get a short checklist on Home (add people, first board, meetings, events, password
manager, notifications) that ticks itself off.

## Roles

| | Member | Lead | Mentor (admin) |
|---|---|---|---|
| See all boards; create, edit and finish tasks | ✓ | ✓ | ✓ |
| Delete a task | own only | ✓ | ✓ |
| Add subitems, post updates, @mention | ✓ | ✓ | ✓ |
| Create boards; manage groups, columns, labels, automations; archive | | ✓ | ✓ |
| Delete a board | | | ✓ |
| See leadership meetings | | ✓ | ✓ |
| See mentor meetings | | | ✓ |
| Schedule and run meetings | facilitator only | ✓ | ✓ |
| Self check-in to a live meeting | ✓ | ✓ | ✓ |
| Add or remove people, change roles, subteams | | | ✓ |
| Equipment: see everything; borrow and return for yourself | ✓ | ✓ | ✓ |
| Equipment: add, edit, delete; lend to anyone; record any return; export | | ✓ | ✓ |
| Activity log | | | ✓ |
| See teammates' email addresses | own only | ✓ | ✓ |

Roles are re-read from the database on **every request**, so removing someone or demoting them takes effect on their next click.

## Security model, stated plainly

### Passwords
The hub has no password vault. An earlier version had one, encrypted with a key the server held, so anyone who
controlled the Cloudflare account could have read every secret. That isn't good enough for the team's real logins, so
it was removed in favour of a Bitwarden-compatible server, where passwords are encrypted on each person's device with
their own master password. The tables were dropped (migration 0013); past "revealed a password" lines stay in the audit log.

### Sign-in
- Production uses **Clerk**. The session token is verified inside the Worker: RS256 is pinned, the issuer is derived from the
  publishable key, the token must have been minted on this app's own origin (`azp`), and pending sessions are refused.
  This is the same check ProjectPro uses.
- A valid Clerk login proves an email address and nothing more. **Only people a mentor has added in Team can get in.** Anyone
  else gets a 401. The first mentor gets in through `BOOTSTRAP_ADMIN_EMAIL`, which only works while the team has no admin.
- The email has to be *verified* (`email_verified` in the token), because the email is what links a login to a person.
- A local dev sign-in exists. It refuses to run unless `ENVIRONMENT=development` **and** `DEV_LOGIN=on` **and** Clerk is not
  configured **and** the request is to localhost. All four conditions are tested.

### Minors
Most users are under 18, so the app stores **name and email only**: no phone numbers, birthdays, photos or addresses.
Members can't see other people's emails. If your district has a data-privacy agreement process, run this through it.

### Other limits you should know about
- **No storage quota for attachments.** Each file is capped at 15 MB, but there's no per-person or team total yet;
  watch the R2 bucket's size in the Cloudflare dashboard.
- **Equipment is an honour system.** The app records what people say they took and brought back; it can't see the
  shelf. A member can mark their own loan returned (in good condition) without handing anything back. Every lend and
  return is in the audit log with who recorded it, so check the shelf against the list now and then.
- **The kiosk trusts whoever is at the tablet.** Anyone standing there can check in a friend who isn't there. It's
  better evidence than self check-in (the tablet is in the shop), not proof. Check the count against the room.
- **Self check-in trusts the device.** It proves someone had the app open while the meeting was live, not that they were in
  the room. Whoever runs the meeting can correct any entry.
- **Push notifications** reach phones and computers where someone turned them on (Inbox → Turn on). On iPhone/iPad
  that only works after adding the app to the Home Screen (iOS 16.4+). There is no email yet.
- **Near-real-time, not real-time.** Boards refresh every 20 seconds while open, and a live meeting every 10 seconds for
  people following along. Two people editing the same cell at once: the last save wins.
- **One owner per task.** The built-in Owner is single on purpose (one person accountable); add a People column for
  helpers. Subitems are one level deep.
- **Logo.** The team logo is in `frontend/public/brand/` with a dark-theme version (outlines and lettering turned
  white), the dragon-head mark used in small spots, the app icons, favicon and notification badge. All of them come
  from one file: to change the logo, run `python3 scripts/brand-assets.py path/to/logo.png` (PNG with a transparent
  background; needs Pillow). The head crop is set for the current artwork, so check the output if the artwork changes.
  The brand colours are in `frontend/tailwind.config.js` (`ACCENT`, `FLAME`).

## Passwords

Team passwords don't live in the hub. Three places, by how much is at stake:

- **Money and identity** (FIRST dashboard, bank/booster club): mentors only, in their own free personal Bitwarden
  accounts (the free plan includes a 2-person organization for two mentors to share these).
- **Services with individual accounts** (Onshape education, GitHub organization, Meta Business Suite): everyone gets their
  own account; nothing shared.
- **Truly shared, lower-stakes logins** (shop Wi-Fi, vendor accounts): **warden-worker**, an open-source,
  Bitwarden-compatible server running as a second Worker on the same free Cloudflare account, with a collection per
  subteam. The official Bitwarden apps encrypt everything on each person's device; the server only stores encrypted data.
  It's a small, unaudited community project, which is why the important logins stay out of it.

Setup, the reviewed version, backups and the review findings: [`deploy/passwords/`](deploy/passwords/). Once it's
deployed, set `PASSWORDS_URL` in `wrangler.toml` to its address; the hub's Passwords page links there.

## Local development

Requires Node 22.13+.

```bash
npm install && npm install --prefix frontend
npm run db:migrate:local
npm run dev                         # worker on :8787, app on http://localhost:5173
node scripts/seed-demo.mjs          # optional, in a second terminal: fake team, boards, meetings, events
npm test                            # integration tests, real SQLite, no mocks of app code
```

`npm run dev` first runs `scripts/setup-dev.mjs`. That creates `.dev.vars` with random secrets (a placeholder
`JWT_SECRET` copied from the example gets filled in), and creates `frontend/dist`, which
`wrangler dev` needs before its first build. The first mentor is `mentor@example.org`; to use another address, set
`BOOTSTRAP_ADMIN_EMAIL` in `.dev.vars` before seeding.

**Using it from other devices (phones, the shop laptop):** `npm run dev:lan` serves the app on your network and prints
its address. Dev sign-in has no passwords, so this lets **anyone on that network sign in as anyone, mentors included**.
Use it with demo data only. Plain `npm run dev` refuses other devices. For real use, deploy (below).

`npm audit` in `frontend/` reports Tailwind 3's build tooling (braces, micromatch, chokidar). It runs only at
build time on your machine and none of it ships to the browser. The fix is a Tailwind 4 migration. Don't run
`npm audit fix --force`: it applies that migration blindly and breaks the styles.

**"no such table" errors** mean the local database is behind the code. `npm run dev` applies pending migrations
before it starts; to do it by hand, run `npm run db:migrate:local`.

## Deploying to Cloudflare

1. `npx wrangler d1 create frc302-hub-db` and paste the id into `wrangler.toml`. Then
   `npx wrangler r2 bucket create frc302-hub-files` for task attachments.
2. Set `APP_URL` in `wrangler.toml` to the URL the team will use, e.g. `https://hub.team302.org`.
3. **Clerk:** create an application.
   - Restrictions → Sign-up mode → **Restricted**. Nobody signs themselves up.
   - Sessions → Customize session token → add
     `{"email": "{{user.primary_email_address}}", "email_verified": "{{user.email_verified}}", "name": "{{user.full_name}}"}`.
   - Add your Clerk frontend host (`clerk.<your domain>`) to `script-src` and `connect-src` in `frontend/public/_headers`.
4. Secrets:
   ```bash
   npx wrangler secret put CLERK_PUBLISHABLE_KEY
   npx wrangler secret put CLERK_JWT_KEY          # Clerk → API keys → JWT public key (PEM)
   npx wrangler secret put BOOTSTRAP_ADMIN_EMAIL  # the head mentor
   npm run vapid                                  # prints a Web Push key pair, then:
   npx wrangler secret put VAPID_PUBLIC_KEY
   npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put VAPID_SUBJECT          # mailto:you@team302.org (push services' contact)
   npx wrangler secret put TBA_API_KEY            # optional: thebluealliance.com/account → Read API key
   ```
5. `npm run deploy` runs the tests, builds the app, migrates D1 and deploys.
6. Sign in as the bootstrap mentor, then add everyone in **Team**. Each person signs in with Clerk using the email you entered.

## Why a new app instead of forking ProjectPro

ProjectPro is about 116k lines of field-service business software: invoicing, Stripe Connect, payroll, QuickBooks, a client
portal and SMS. A robotics team would use maybe 5% of it, and would still inherit all of its complexity, attack surface and
migrations. This repo keeps what carried over well:

- the Cloudflare Worker + D1 + Workers Assets deployment
- the networkless Clerk verification
- the AES-GCM field encryption, extended with key ids for rotation
- the Tailwind design tokens and component styles

Everything else is purpose-built. The result is a codebase a student programmer can read end to end.

## Layout

```
migrations/                     0001 core schema; 0002 columns, values, subitems, history, notifications, automations
worker/src/index.js             router, error handling, security headers, hourly due-date reminders
worker/src/lib/items.js         every task change goes through here: history, notifications, automations
worker/src/lib/                 auth (Clerk + dev), column validation, audit + rate limit, reminders, TBA, CSV
worker/src/routes/              boards, items, meetings, kiosk, expenses, equipment, team, home, auth
worker/test/                    integration tests (node:test + a node:sqlite D1 shim)
frontend/src/components/board/  the board: table, cells, columns, views, task panel, controls, useBoard
frontend/src/components/ui/     ProjectPro's component library (modals, stat cards, charts, avatars, …)
frontend/src/components/layout/ app shell, sidebar, top bar
frontend/src/pages/             Home, My work, Inbox, Boards, Board, Meetings, Meeting, Passwords, Expenses, Equipment, People, Audit log
scripts/seed-demo.mjs           demo data for local dev only
```
