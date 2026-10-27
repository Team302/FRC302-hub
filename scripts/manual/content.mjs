// The user manual's text and figures. Each chapter has sections; each section has blocks:
//   ['p', html] ['h3', text] ['steps', [html]] ['list', [html]] ['note'|'tip'|'warn', html]
//   ['table', [head], [[cells]], class?]
//   ['fig', spec, caption, { scaleTo?, small? }]  spec: see shots.mjs; callouts are [selector, legend text, opts]
// audience: 'everyone' (default) | 'leads' | 'mentors'. Keep UI words in ui() exactly as the app shows them.
const ui = (t) => `<span class="ui">${t}</span>`
const k = (...keys) => keys.map((x) => `<kbd>${x}</kbd>`).join(' ')

const nav = 'nav[aria-label="Main navigation"]'
const openTask = (title) => async (page) => { await page.locator(`button[aria-label^="Open ${title}"]`).first().click(); await page.locator('aside[role="dialog"]').waitFor({ timeout: 8000 }) }
const click = (selector) => async (page) => { await page.locator(selector).first().click(); await page.waitForTimeout(300) }

export const chapters = [
  {
    title: 'Getting started',
    intro: '302 Hub is Team 302’s own web app for the work of running a robotics team: tasks and builds, meetings and attendance, the season’s events and trips, shop equipment and expenses. This chapter gets you signed in, shows you around the screen, and puts the hub on your phone.',
    sections: [
      {
        title: 'Who can do what',
        blocks: [
          ['p', 'Everyone on the team has one of three roles. Your role is shown under your name at the bottom of the sidebar. It decides what you see and what you can change; mentors set it on the People page.'],
          ['table', ['Role', 'Who', 'In short'], [
            ['<b>Member</b>', 'Students', 'Work on tasks, check in to meetings, sign up for trips, borrow equipment, submit expenses.'],
            ['<b>Lead</b>', 'Student subteam leads, captains', 'Everything members do, plus: create and set up boards, run meetings, run the shop tablet, manage trips and equipment, see workload and attendance.'],
            ['<b>Mentor</b>', 'Adult mentors and coaches', 'Everything, plus: add and remove people, approve expenses and set budgets, tick off permission slips and fees, see the audit log, download backups.'],
          ]],
          ['p', 'Each section of this manual is marked with who it is for: <span class="aud aud-all">Everyone</span>, <span class="aud aud-lead">Leads and mentors</span> or <span class="aud aud-mentor">Mentors only</span>. The full list of permissions is in Appendix A.'],
        ],
      },
      {
        title: 'Signing in',
        blocks: [
          ['p', 'You can’t make your own account. A mentor adds your email address on the People page; after that, go to the hub’s address and sign in with that email. The sign-in screen walks you through the rest.'],
          ['tip', `New students and families can read the one-page welcome at <b>/welcome</b> on the hub’s address before they have an account. It prints on a single sheet for kickoff.`],
          ['fig', { id: 'welcome', path: '/welcome', width: 1000, height: 820, target: 'viewport', pad: 0, prepare: async (page) => { await page.evaluate(() => { const b = [...document.querySelectorAll('b')].find((el) => /localhost|:\d+/.test(el.textContent)); if (b) b.textContent = 'your hub’s address' }) } }, 'The one-page welcome, readable without signing in. It shows your hub’s real address.', { small: true, scaleTo: 1000 }],
        ],
      },
      {
        title: 'Finding your way around',
        blocks: [
          ['p', 'Every page has the same frame: the sidebar on the left, the top bar across the top, and the page itself in the middle.'],
          ['fig', {
            id: 'layout', as: 'ava', path: '/', target: 'viewport', width: 1280, height: 820,
            callouts: [
              [`${nav} >> text=Home`, 'The <b>sidebar</b>: your pages (Home, My work, Inbox) and the team’s (Season, Meetings, Expenses, Equipment…). Leads and mentors see a few more.', { side: 'r', box: false }],
              [`${nav} >> text=All boards`, 'The team’s <b>boards</b>. Starred ones stay at the top.', { side: 'r', box: false }],
              ['[aria-label="Search tasks, boards and meetings"]', '<b>Search</b> tasks, boards and meetings from anywhere. Shortcut: ' + k('Ctrl', 'K') + '.', { side: 'b' }],
              ['button[aria-label^="Inbox"], a[aria-label^="Inbox"]', 'The <b>bell</b> shows unread notifications and opens your Inbox.', { side: 'b' }],
              ['button[aria-label="Account menu"]', 'Your <b>account menu</b>: calendar feed and sign out. The sun/moon button beside it switches light and dark.', { side: 'b' }],
              ['button[aria-label="New"]', '<b>New</b>: make a task (or, for leads, a board or meeting) from any page.', { side: 'b' }],
            ],
          }, 'The hub’s frame, here on a student’s Home page.'],
          ['p', `The ${ui('Guide')} page in the sidebar has a short version of this manual for each role. `],
        ],
      },
      {
        title: 'Putting it on your phone',
        blocks: [
          ['p', 'The hub is a web app: there’s nothing to download from an app store. Add it to your Home Screen once and it opens full screen like any other app, and can send you notifications.'],
          ['h3', 'iPhone and iPad'],
          ['steps', [
            'Open the hub’s address in <b>Safari</b> (it must be Safari for this step).',
            `Tap the Share button, then ${ui('Add to Home Screen')}, then ${ui('Add')}.`,
            'From now on, open the hub from the new icon on your Home Screen.',
          ]],
          ['h3', 'Android'],
          ['steps', [
            'Open the hub’s address in <b>Chrome</b>.',
            `Tap the ⋮ menu, then ${ui('Install app')} (or ${ui('Add to Home screen')}).`,
          ]],
          ['fig', { id: 'phone-home', as: 'ava', path: '/', phone: true }, 'Home on a phone. The sidebar is behind the ☰ menu button in the top-left corner.'],
        ],
      },
      {
        title: 'Notifications',
        blocks: [
          ['p', 'The hub tells you when you’re given a task, mentioned in an update, asked to review something, when a task you own is due, when a trip place opens up, and more. Everything goes to your <b>Inbox</b>; you can also get it on your phone or computer as a notification.'],
          ['fig', {
            id: 'inbox', as: 'ava', path: '/inbox', height: 760,
            callouts: [
              ['button:has-text("Turn on")', `${ui('Turn on')} notifications for the device you’re using. Each phone or computer is turned on separately.`],
              ['text=Mark all read', `${ui('Mark all read')} clears the unread count.`],
              ['[aria-label="Show"]', 'Show everything, or unread only.'],
            ],
          }, 'The Inbox, with the switch for notifications on this device.'],
          ['warn', 'On an iPhone, notifications only work when the hub is opened from its Home Screen icon (iOS 16.4 or newer), not from inside Safari. If the button says your device isn’t supported, add the hub to your Home Screen first.'],
        ],
      },
      {
        title: 'Calendar feed',
        blocks: [
          ['p', `Your account menu has a private ${ui('Calendar feed')} link. Add it to Google Calendar, Apple Calendar or Outlook as a subscription and the team’s meetings, the season’s events and your own due dates appear there and stay up to date.`],
          ['note', 'The link works without signing in, so treat it like a password: don’t post it. If it leaks, make a new one from the same place; the old one stops working.'],
          ['fig', { id: 'account-menu', as: 'ava', path: '/', prepare: click('button[aria-label="Account menu"]'), target: '[role="menu"]', pad: 6, callouts: [['text=Calendar feed', 'Get your private calendar link.']] }, 'The account menu.', { small: true, scaleTo: 700 }],
        ],
      },
    ],
  },

  {
    title: 'Your work',
    intro: 'Home and My work answer “what do I need to do?”. Search and keyboard shortcuts get you anywhere quickly.',
    sections: [
      {
        title: 'Home',
        blocks: [
          ['fig', {
            id: 'home', as: 'ava', path: '/', height: 1000,
            callouts: [
              ['text=Join', 'A meeting is running now: open it and check in.', { side: 'l' }],
              ['text=My open tasks >> xpath=ancestor::*[contains(@class,"card")][1]', 'Your numbers: open tasks, <b>hours this season</b> and attendance rate, anything overdue, the next meeting.', { side: 'tl' }],
              ['text=My work >> nth=1', 'Your tasks, soonest first.', { side: 'l', box: false }],
              ['text=Upcoming meetings', 'The next few meetings you’re invited to.', { side: 'l', box: false }],
            ],
          }, 'A student’s Home page.'],
          ['p', 'Your hours count from when you check in to a meeting to when you check out (Chapter 4). They’re what lettering and travel eligibility are based on, so check in every time.'],
        ],
      },
      {
        title: 'My work',
        blocks: [
          ['p', `${ui('My work')} lists every task and subitem you own across all boards, grouped into Overdue, Today, the next 7 days and later. Tasks waiting for <i>your</i> review are at the top, with an ${ui('Approve')} button.`],
          ['fig', {
            id: 'mywork', as: 'marcus', path: '/my-work', height: 760,
            callouts: [
              ['text=/^Waiting for your review/', 'Someone asked you to check their work (section 3.4).', { box: false, side: 'l' }],
              ['button:has-text("Approve")', 'Approve it from here, or open the task to ask for changes.'],
            ],
          }, 'My work for Marcus, who has a review waiting.'],
        ],
      },
      {
        title: 'Search and keyboard shortcuts',
        blocks: [
          ['p', `Press ${k('Ctrl', 'K')} (${k('⌘', 'K')} on a Mac) or click the search bar to search tasks, boards and meetings you can see. Use the arrow keys and ${k('Enter')} to open a result.`],
          ['fig', { id: 'palette', as: 'ava', path: '/', prepare: async (page) => { await page.locator('[aria-label="Search tasks, boards and meetings"]').click(); await page.keyboard.type('swerve'); await page.waitForTimeout(700) }, target: 'viewport', height: 520, maxHeight: 420 }, 'Searching for “swerve”.'],
          ['table', ['Keys', 'Does'], [
            [k('Ctrl', 'K'), 'Search from anywhere'],
            [k('c'), 'New task'],
            [k('/'), 'Search this board'],
            [`${k('g')} then ${k('h')} / ${k('w')} / ${k('i')} / ${k('b')} / ${k('m')} / ${k('s')} / ${k('v')} / ${k('p')}`, 'Go to Home, My work, Inbox, Boards, Meetings, Season, Passwords, People'],
            [k('?'), 'Show all shortcuts'],
            [k('Esc'), 'Close a panel or dialog'],
          ]],
        ],
      },
    ],
  },

  {
    title: 'Boards and tasks',
    intro: 'Boards hold the team’s work. Each subteam or project has one; each piece of work on it is a task with an owner, a status and a due date.',
    sections: [
      {
        title: 'Reading a board',
        blocks: [
          ['p', 'A board is a table of tasks split into <b>groups</b> (phases like Design → Fabrication → Assembly → Testing, or anything else). Every task has an Owner, Status, Priority and Due date; boards add their own columns, like Subsystem or Est. hours.'],
          ['fig', {
            id: 'board', as: 'jordan', path: (c) => `/boards/${c.robot.id}`, width: 1440, height: 760,
            callouts: [
              ['[aria-label="Board views"]', 'Switch view: the table, Kanban, Calendar, Timeline or Chart.', { side: 'l' }],
              ['button:has-text("New task") >> nth=0', 'Add a task to the first group.', { side: 'l' }],
              ['[aria-label="Search this board"]', 'Search, filter by person, filter by status or date, and sort.'],
              ['text=Design >> nth=0', 'A <b>group</b>. Click the arrow to fold it away.', { side: 'l' }],
              ['text=Needs review >> nth=0', 'Click any status to change it.'],
              ['text=Automate', 'Leads: automations, export, trash and board settings.'],
            ],
          }, 'The 2027 Robot board.', { scaleTo: 1440 }],
          ['list', [
            '<b>Owner</b> is the one person responsible. A grey + means nobody owns it yet.',
            '<b>Status</b>: Not started, Working on it, Stuck, Needs review, Done. Boards can rename these.',
            '<b>Due date</b> turns orange when it’s close and red when it’s late.',
            'The row under each group <b>sums it up</b>: status mix, who’s involved, date range, totals.',
            'A small number next to a title means it has <b>subitems</b>; a speech bubble means it has <b>updates</b>.',
          ]],
        ],
      },
      {
        title: 'Adding a task',
        blocks: [
          ['p', 'There are two ways, depending on where you are:'],
          ['list', [
            `<b>Typing it into a group:</b> click ${ui('+ Add task')} at the bottom of the group, type the name and press Enter. The task appears in that group; fill in its owner, due date and the rest by clicking the cells in its row.`,
            `<b>With the button:</b> ${ui('New task')} at the top of a board (shortcut ${k('c')}) adds a task called “New task” to the first group and opens its panel, so you can name it and fill everything in at once. ${ui('New')} in the top bar does the same from any page and asks which board.`,
          ]],
          ['tip', 'Name tasks so someone else would know what “done” means: “Cut and drill frame rails”, not “frame”.'],
        ],
      },
      {
        title: 'The task panel',
        blocks: [
          ['p', `Point at a task and click the ${ui('⤢')} button at the end of its name (it shows the number of updates instead, if there are any) to open its panel on the right. Clicking the name itself lets you rename the task. On a phone, tap the card.`],
          ['fig', {
            id: 'panel', as: 'jordan', path: (c) => `/boards/${c.robot.id}`, prepare: openTask('Belly pan (waiting on polycarb)'), target: 'aside[role="dialog"]', width: 1440, height: 1000, pad: 0,
            callouts: [
              ['[aria-label="Task name"]', 'The task’s name. Click to rename it.'],
              ['aside[role="dialog"] >> text=Status >> nth=0', 'Every field on the board, one per row. Click a value to change it.', { side: 'r', box: false }],
              ['[aria-label="Task sections"]', 'Updates, Subitems, Files and History.', { side: 'r', box: false }],
              ['[placeholder="Write an update. Type @ to mention someone."]', 'Write an update. Type <b>@</b> and a name to bring someone in; they get a notification.', { side: 'tr' }],
              ['[aria-label="Move task to trash"]', 'Duplicate the task, or move it to the trash.'],
            ],
          }, 'The task panel for a stuck task.', { scaleTo: 1100 }],
          ['h3', 'Updates instead of chat'],
          ['p', 'Post questions, progress and photos as updates on the task instead of in a group chat. They stay with the work, everyone who owns or follows the task is told, and the next person to pick it up can read the history.'],
          ['h3', 'Files'],
          ['p', 'Drag photos, PDFs or CAD exports onto the panel (up to 15 MB each). They’re stored with the task.'],
          ['h3', 'History'],
          ['p', 'Every change to the task (who changed what, and when) is listed under History.'],
        ],
      },
      {
        title: 'Reviews and approval',
        blocks: [
          ['p', `A task can have a <b>Reviewer</b> as well as an Owner: a lead, a mentor or someone on the subteam who checks the work before it counts as done. When the work is ready, the owner clicks ${ui('Submit for review')}. The reviewer is notified and the task waits in their My work.`],
          ['fig', {
            id: 'review', as: 'marcus', path: (c) => `/boards/${c.robot.id}`, prepare: openTask('Swerve module CAD'), target: 'aside[role="dialog"]', width: 1440, height: 1000, pad: 0, maxHeight: 640,
            callouts: [
              ['aside[role="dialog"] button:has-text("Request changes")', `${ui('Request changes')} sends it back to Working on it with your note posted as an update.`],
              ['aside[role="dialog"] button:has-text("Approve")', `${ui('Approve')} marks it Done and records who signed off.`],
            ],
          }, 'What the reviewer sees on a task that needs review.', { scaleTo: 1100 }],
          ['p', 'A review that waits 2 days gets the reviewer a daily reminder; after 4 days the subteam’s leads hear about it too.'],
          ['note', `On a board with ${ui('Done needs approval')} turned on (board Settings), only the task’s reviewer, a lead or a mentor can mark it Done. Done is greyed out for everyone else, with the reason. You can’t be your own reviewer.`],
        ],
      },
      {
        title: 'Other views',
        blocks: [
          ['p', 'The same tasks can be seen in different ways. Pick a view from the tabs above the board; the hub remembers your choice for each board.'],
          ['fig', { id: 'kanban', as: 'jordan', path: (c) => `/boards/${c.robot.id}`, width: 1440, height: 760, prepare: click('[aria-label="Board views"] >> text=Kanban') }, '<b>Kanban</b>: a column per status. Drag a card to change its status.', { scaleTo: 1440 }],
          ['fig', { id: 'timeline', as: 'jordan', path: (c) => `/boards/${c.robot.id}`, width: 1440, height: 680, prepare: click('[aria-label="Board views"] >> text=Timeline') }, '<b>Timeline</b>: tasks with dates as bars, for planning the build season.', { scaleTo: 1440 }],
          ['p', '<b>Calendar</b> shows tasks on the day they’re due (drag one to move its due date). <b>Chart</b> shows the status mix and how many open tasks each person and group has.'],
        ],
      },
      {
        title: 'Working with many tasks',
        blocks: [
          ['p', 'Tick the boxes at the start of rows to select several tasks. A bar appears at the bottom to change their status or owner, move them to another group, duplicate them or delete them in one go.'],
          ['fig', { id: 'bulk', as: 'jordan', path: (c) => `/boards/${c.robot.id}`, width: 1440, height: 900, target: 'viewport', prepare: async (page) => { const boxes = page.locator('#main input[type="checkbox"]'); await boxes.nth(1).check(); await boxes.nth(2).check() }, callouts: [['text=Tasks selected', 'Two tasks selected. Change their status or owner, move, duplicate or delete them all at once.', { side: 'tl' }]], maxHeight: 900 }, 'Two tasks selected.', { scaleTo: 1440 }],
          ['h3', 'Trash and Undo'],
          ['p', `Deleting a task shows ${ui('Undo')} for a few seconds. After that it waits in the board’s Trash (the bin button at the top) for 30 days, with its subitems, updates and files, and a lead, its creator or whoever deleted it can restore it.`],
          ['h3', 'Export'],
          ['p', 'The download button at the top of a board saves every task and subitem as a spreadsheet (CSV) for parts lists, sponsor reports and grant applications.'],
        ],
      },
      {
        title: 'Setting up a board',
        audience: 'leads',
        blocks: [
          ['steps', [
            `Click ${ui('+')} next to <b>Boards</b> in the sidebar (or ${ui('New')} → board).`,
            'Name it, pick its subteam and a <b>template</b>: Robot build, Parts & purchasing, Competition prep, Outreach, or blank. Templates come with sensible groups and columns.',
            `Use ${ui('Settings')} on the board to rename statuses, hide fields, add columns (people, date, timeline, numbers, checkbox, tags, link…) and turn on ${ui('Done needs approval')}.`,
            'Give groups a default reviewer if all their tasks should be checked.',
          ]],
          ['fig', { id: 'automate', as: 'jordan', path: (c) => `/boards/${c.robot.id}`, width: 1440, prepare: click('button:has-text("Automate")'), target: 'dialog' }, 'Automations on the 2027 Robot board.', { small: true, scaleTo: 1100 }],
          ['p', '<b>Automations</b> do the chasing for you: “when status changes to Done, move it to Testing”, “when Stuck, notify a mentor”, “when a task is created, assign it to…”.'],
          ['tip', 'Keep boards small. Every column is something people have to fill in; a board nobody updates is worse than none.'],
        ],
      },
      {
        title: 'Boards on a phone',
        blocks: [
          ['fig', { id: 'phone-board', as: 'ava', path: (c) => `/boards/${c.robot.id}`, phone: true }, 'A board on a phone shows tasks as cards. Tap a status to change it; there’s a switch for the full table.'],
        ],
      },
    ],
  },

  {
    title: 'Meetings and attendance',
    intro: 'Meetings in the hub have an agenda, run with a timer, take attendance, and turn decisions into tasks. Checking in is how your hours are counted.',
    sections: [
      {
        title: 'The meetings list',
        blocks: [
          ['fig', {
            id: 'meetings', as: 'jordan', path: '/meetings', height: 820,
            callouts: [
              ['button:has-text("Schedule meeting")', 'Leads: schedule a meeting, once or every week.'],
              ['button:has-text("Shop kiosk")', 'Leads: set up the shop tablet (4.6).'],
              ['text=In progress >> nth=0', 'A meeting running now.', { side: 'l' }],
            ],
          }, 'Upcoming meetings.'],
          ['p', 'Leadership meetings are only shown to leads and mentors, and mentor meetings only to mentors.'],
        ],
      },
      {
        title: 'Checking in and out',
        blocks: [
          ['p', 'When you arrive at a meeting, check in one of two ways:'],
          ['list', [
            '<b>On the shop tablet</b> by the door: find your name, tap it, tap Check in (4.6).',
            `<b>On your phone</b>: open the meeting (Home shows it while it’s running) and tap ${ui('Check in')}.`,
          ]],
          ['p', `Leaving early? Tap your name on the tablet again, or tap ${ui('Leaving early? Check out')} on the meeting. Coming back, check in again. Your hours count from check-in to check-out; if the person running the meeting marks you present instead, the whole meeting counts.`],
          ['fig', { id: 'phone-checkin', as: 'ava', path: (c) => `/meetings/${c.allHands.id}`, phone: true, clock: (c) => c.allHandsStartedAt + 150000, callouts: [['button:has-text("Check in")', `${ui('Check in')} while the meeting is running.`]] }, 'Checking in on a phone.'],
          ['tip', 'Forgot to check in? Ask whoever ran the meeting. They can mark you present.'],
        ],
      },
      {
        title: 'Planning the agenda',
        audience: 'leads',
        blocks: [
          ['p', 'An agenda is a list of topics, each with an owner and a number of minutes. The hub warns you when the agenda is longer than the meeting. You can copy last week’s agenda.'],
          ['fig', { id: 'agenda', as: 'jordan', path: (c) => `/meetings/${c.nextWeekly.id}`, height: 860, callouts: [['[aria-label="Meeting sections"]', 'Agenda before, Run during, Recap after.', { side: 'l' }], ['[placeholder="Add a topic"]', 'Add a topic, its owner and minutes.']] }, 'Planning a weekly all-hands.'],
        ],
      },
      {
        title: 'Running a meeting',
        audience: 'leads',
        blocks: [
          ['p', `Press ${ui('Start')} when the meeting begins. The ${ui('Run')} tab takes you through the agenda one topic at a time.`],
          ['fig', {
            id: 'run', as: 'jordan', path: (c) => `/meetings/${c.allHands.id}`, height: 1260, clock: (c) => c.allHandsStartedAt + 150000,
            callouts: [
              ['text=/(remaining|over) of \\d+ min/', 'A countdown for the current topic. It turns red when you run over.'],
              ['[placeholder="Notes for this topic"]', 'Notes for this topic; they go into the recap.', { side: 'l' }],
              ['button:has-text("Next topic")', `${ui('Next topic')} moves on; ${ui('End meeting')} finishes.`],
              ['text=Mark the rest present', 'Attendance: click a name to cycle present, late, excused, absent. People who checked in themselves are already marked.', { side: 'r' }],
              ['[placeholder="One decision per line"]', 'Decisions, one per line.', { side: 'l' }],
              ['[placeholder="What needs doing"]', '<b>Action items</b> become real tasks on the board you pick, with an owner and due date.'],
            ],
          }, 'Running the Tuesday all-hands.'],
        ],
      },
      {
        title: 'The recap',
        blocks: [
          ['p', `After the meeting, the ${ui('Recap')} tab has a summary (attendance, notes, decisions and action items) to ${ui('Copy')} into Discord, Slack or an email, or to ${ui('Print')}.`],
          ['fig', { id: 'recap', as: 'jordan', path: (c) => `/meetings/${c.pastMeeting.id}`, height: 900, prepare: click('[aria-label="Meeting sections"] >> text=Recap') }, 'The recap of a past build session.'],
        ],
      },
      {
        title: 'The shop tablet',
        audience: 'leads',
        blocks: [
          ['p', 'A tablet by the shop door can check people in and out without anyone signing in on it. While a team, build or subteam meeting is running, it shows everyone’s name; students tap theirs.'],
          ['steps', [
            `On ${ui('Meetings')}, click ${ui('Shop kiosk')} → ${ui('Set up kiosk')} and give it a name.`,
            'Open the link it gives you on the tablet (it’s shown once), and add it to the tablet’s home screen.',
            'Leave it there. It wakes up by itself when a meeting starts.',
          ]],
          ['fig', {
            id: 'kiosk', path: (c) => `/kiosk/${c.kiosk.token}`, width: 1180, height: 820, target: 'viewport',
            callouts: [
              ['[aria-label="Find your name"]', 'Students search for their name…', { side: 'l' }],
              ['text=Everyone', '…or pick their subteam.'],
              ['text=Mia C.', 'Names show as first name and last initial. Green means checked in; tap again to check out.'],
            ],
          }, 'The shop tablet during the Tuesday all-hands.', { scaleTo: 1180 }],
          ['fig', { id: 'kiosk-confirm', path: (c) => `/kiosk/${c.kiosk.token}`, width: 1180, height: 820, target: '[role="dialog"]', prepare: async (page) => { await page.getByText('Ava T.', { exact: true }).click(); await page.waitForTimeout(300) } }, 'Every tap asks once more, so nobody checks in the wrong person.', { small: true, scaleTo: 700 }],
          ['warn', 'The tablet link can only list names and record check-ins; it never shows leadership or mentor meetings or anything else in the hub. Still, if the tablet goes missing, turn the link off from the same Shop kiosk dialog. Links expire after 120 days.'],
        ],
      },
    ],
  },

  {
    title: 'Season and trips',
    intro: 'The Season page has kickoff, competitions, deadlines and outreach days with a countdown. Trips to competitions have a sign-up list and a checklist for permission slips, fees and forms.',
    sections: [
      {
        title: 'The season',
        blocks: [
          ['fig', {
            id: 'season', as: 'ava', path: '/season', height: 900,
            callouts: [
              ['text=Next up', 'The next event and how many days are left.', { side: 'l' }],
              ['text=/going, \\d+ waiting/', 'How many are going on a trip. Click to open its roster and sign up.'],
            ],
          }, 'The season, as a student sees it.'],
          ['p', 'Season events are in everyone’s calendar feed. During a competition the team is registered for, Home shows the team’s rank, record and next match from The Blue Alliance.'],
        ],
      },
      {
        title: 'Signing up for a trip',
        blocks: [
          ['p', `When a lead opens sign-up for an event, open it from Season and tap ${ui('I’m going')}. If all the places are taken, you join the waitlist instead and get a notification if a place opens up.`],
          ['fig', { id: 'phone-trip', as: 'ethan', path: (c) => `/season/${c.trip.id}`, phone: true, callouts: [['text=You’re going', 'Your place on the trip.'], ['text=Permission slip', 'Your checklist. A mentor ticks each item when they have it.', { side: 'l' }], ['text=Drop out', `${ui('Drop out')} while sign-up is open.`]] }, 'A student who is going, with the checklist done.'],
          ['list', [
            'Permission slips, fees and medical forms go <b>on paper to a mentor</b>. The hub only records that each one is in; it never holds the form.',
            'A week before the trip, anyone with items still open gets a reminder saying which.',
            `Can’t go after all? ${ui('Drop out')} before sign-up closes so the next person gets your place. After it closes, tell a mentor.`,
            'Your note on the trip (“leaving Saturday at noon”) is only seen by you, leads and mentors. Don’t put medical details there.',
          ]],
        ],
      },
      {
        title: 'Running a trip',
        audience: 'leads',
        blocks: [
          ['fig', {
            id: 'trip', as: 'coach', path: (c) => `/season/${c.trip.id}`, width: 1180, height: 1100,
            callouts: [
              ['text=Students going', 'Students going out of the places available, plus mentors (who don’t take a place).'],
              ['button:has-text("Sign-up settings")', 'Open or close sign-up, set the number of places and the last day.'],
              ['button:has-text("Export CSV")', 'The roster as a spreadsheet for the school or the bus company.'],
              ['[aria-label="Add someone"]', 'Add anyone, even past the cap.', { side: 'l' }],
              ['button[aria-pressed] >> nth=0', 'Tick checklist items per person. Locked ones are for mentors.', { side: 'l' }],
              ['text=Checklist >> nth=0', 'The trip’s checklist. Add items like “room assigned”.', { side: 'l', box: false }],
            ],
          }, 'A trip roster, as a mentor sees it.'],
          ['fig', { id: 'trip-settings', as: 'jordan', path: (c) => `/season/${c.trip.id}`, prepare: click('button:has-text("Sign-up settings")'), target: 'dialog' }, 'Sign-up settings.', { small: true, scaleTo: 900 }],
          ['note', 'The cap counts students. Mentors on the list are chaperones and never wait. When someone drops out, is removed from the team or becomes a mentor, the first person on the waitlist moves up and is told.'],
          ['warn', 'Permission slip, Trip fee paid and Medical & emergency form are <b>mentor-only</b>: only mentors can tick, rename or remove them. Tick them when you have the paper, not when a student says it’s coming.'],
        ],
      },
    ],
  },

  {
    title: 'Equipment',
    intro: 'What the team owns, where it lives, and who has it right now.',
    sections: [
      {
        title: 'Borrowing and returning',
        blocks: [
          ['fig', {
            id: 'equipment', as: 'ava', path: '/equipment', height: 900,
            callouts: [
              ['text=You’re holding', 'What you have out right now.', { side: 'l' }],
              ['[placeholder="Search name, tag, location"]', 'Search by name, tag or location, or filter by category.'],
              ['button:has-text("Borrow") >> visible=true >> nth=0', `${ui('Borrow')} takes one out in your name.`],
            ],
          }, 'Equipment, as a student sees it.'],
          ['steps', [
            `Find the item and click ${ui('Borrow')}. Say when you’ll bring it back if you know.`,
            `When you put it back, click ${ui('Return')} on it under ${ui('You’re holding')}, and say if it came back damaged.`,
          ]],
          ['p', 'A row can be a bin of identical things (“4 of 6 available”). Overdue borrowers get a reminder once a day. Anything that comes back needing repair or broken tells the leads and mentors.'],
        ],
      },
      {
        title: 'Looking after the equipment list',
        audience: 'leads',
        blocks: [
          ['p', `Leads and mentors ${ui('Add item')} (name, tag, category, location, how many), edit items, ${ui('Lend')} to anyone, record any return and ${ui('Export CSV')}. An item someone still has can’t be deleted, only retired.`],
          ['fig', { id: 'equipment-lead', as: 'jordan', path: '/equipment', height: 760, callouts: [['button:has-text("Add item")', 'Add an item.'], ['button:has-text("Lend") >> visible=true >> nth=0', `${ui('Lend')} an item to anyone.`], ['text=Lent out >> visible=true >> nth=0', 'Who has it, and when it’s due back.', { side: 'l' }]] }, 'Equipment, as a lead sees it.'],
        ],
      },
    ],
  },

  {
    title: 'Expenses',
    intro: 'Spent money for the team? Log it here with the receipt. Mentors approve it, keep the budget, and pay people back.',
    sections: [
      {
        title: 'Submitting an expense',
        blocks: [
          ['warn', 'Ask a mentor <b>before</b> you buy anything for the team.'],
          ['steps', [
            `Go to ${ui('Expenses')} and click ${ui('New expense')}.`,
            'Enter the amount, what it was for, the vendor, the date and the category.',
            `Under ${ui('Paid with')}, say whether it was the team’s money or your own (so you get paid back).`,
            'Add a photo or PDF of the receipt.',
          ]],
          ['fig', { id: 'expense-new', as: 'ava', path: '/expenses', prepare: click('button:has-text("New expense")'), target: 'dialog', height: 1000 }, 'The New expense form.', { small: true, scaleTo: 900 }],
          ['p', 'A mentor approves it or says why not (you’ll see the reason), then marks money you spent yourself as paid back. You only see your own expenses.'],
        ],
      },
      {
        title: 'Budget and approvals',
        audience: 'mentors',
        blocks: [
          ['fig', {
            id: 'expenses-mentor', as: 'coach', path: '/expenses', height: 1100,
            callouts: [
              ['text=Owed to people', 'The season at a glance: budget, spent, waiting for review, and who is owed money.', { side: 'l' }],
              ['text=By category', 'Budget vs spent vs pending, per category, for the season (Aug 1 to Jul 31).', { side: 'l', box: false }],
              ['text=/^Needs review/', 'What’s waiting for a decision. Click an expense to open it.', { side: 'tl' }],
            ],
          }, 'Expenses for mentors.'],
          ['fig', {
            id: 'expense-decide', as: 'coach', path: '/expenses', target: 'dialog',
            prepare: async (page) => { await page.getByRole('button', { name: 'Hotel deposit, Lake City' }).first().click(); await page.locator('[role="dialog"]').waitFor() },
            callouts: [
              ['[role="dialog"] button:has-text("Approve")', `${ui('Approve')} it.`],
              ['[role="dialog"] button:has-text("Don’t approve")', `${ui('Don’t approve')} asks for a reason, which the person sees.`],
            ],
          }, 'Deciding on an expense. Once approved, money someone spent themselves gets a <span class="ui">Mark paid back</span> button here.', { small: true, scaleTo: 900 }],
          ['list', [
            `${ui('Set the budget')} per category at the start of each season.`,
            'A mentor can’t approve their own reimbursement when there’s another mentor. Every decision is in the audit log.',
            'Export the season to CSV for the treasurer.',
          ]],
        ],
      },
    ],
  },

  {
    title: 'People',
    intro: 'Everyone on the team, their role and their subteam.',
    sections: [
      {
        title: 'The People page',
        blocks: [
          ['fig', { id: 'people', as: 'coach', path: '/team', height: 860, callouts: [['button:has-text("Add person")', 'Mentors add people by email.'], ['text=Subteams >> nth=0', 'The team’s subteams.', { side: 'l', box: false }]] }, 'People, as a mentor sees it.'],
          ['p', 'Students see names, roles and subteams. Email addresses are only shown to leads and mentors.'],
        ],
      },
      {
        title: 'Adding and removing people',
        audience: 'mentors',
        blocks: [
          ['steps', [
            `Click ${ui('Add person')}, enter their name and the email they’ll sign in with, and pick a role and subteam.`,
            'Tell them to sign in. Send new students the /welcome page.',
          ]],
          ['fig', { id: 'person-edit', as: 'coach', path: '/team', prepare: async (page) => { await page.locator('button[aria-label="Edit Liam Novak"]').click(); await page.locator('[role="dialog"]').waitFor() }, target: 'dialog', callouts: [['button:has-text("Remove from team")', `${ui('Remove from team')} cuts off their access on their next click.`]] }, 'Editing a person.', { small: true, scaleTo: 900 }],
          ['p', 'When someone leaves: remove them here, reassign the tasks they owned, remove them from the team password manager, and change any shared password they knew.'],
          ['note', 'The team must always have at least one active mentor, so the hub won’t let you remove or demote the last one.'],
        ],
      },
    ],
  },

  {
    title: 'Tools for leads and mentors',
    intro: 'Seeing who has too much, who has nothing, who has been coming, and what changed.',
    sections: [
      {
        title: 'Workload',
        audience: 'leads',
        blocks: [
          ['fig', { id: 'workload', as: 'jordan', path: '/workload', height: 760 }, 'Workload: open, overdue and stuck tasks and reviews waiting, per person, across every board.'],
          ['p', 'Use it before assigning new work, and to spot people with nothing assigned.'],
        ],
      },
      {
        title: 'Attendance and hours',
        audience: 'leads',
        blocks: [
          ['fig', { id: 'attendance', as: 'jordan', path: '/attendance', height: 760, callouts: [['button:has-text("Export CSV")', 'Export for lettering, travel eligibility and grant reports.']] }, 'Hours and attendance rate per person.'],
          ['p', 'Filter by date range and subteam. Hours come from check-in to check-out, or the whole meeting when the person running it marked someone present.'],
        ],
      },
      {
        title: 'Audit log and backup',
        audience: 'mentors',
        blocks: [
          ['fig', { id: 'activity', as: 'coach', path: '/activity', height: 760 }, 'The audit log: who did what, and when.'],
          ['p', `${ui('Download backup')} on this page saves boards, tasks, meetings, attendance, events, trips, the roster, expenses, equipment and the audit log as one file. Download one at the end of every season and before big changes, and keep it somewhere safe: it has names and email addresses.`],
        ],
      },
      {
        title: 'The setup checklist',
        audience: 'mentors',
        blocks: [
          ['fig', { id: 'setup', as: 'coach', path: '/', target: 'text=Set up Team 302 Hub >> xpath=ancestor::*[contains(@class,"card")][1]' }, 'Mentors see this on Home until everything is done. It ticks itself off.', { scaleTo: 1100 }],
        ],
      },
    ],
  },

  {
    title: 'Passwords',
    intro: 'The hub does not store passwords.',
    sections: [
      {
        title: 'Where the team’s logins are',
        blocks: [
          ['fig', { id: 'passwords', as: 'ava', path: '/passwords', height: 900, callouts: [['text=Open passwords', 'Opens the team password manager.']] }, 'The Passwords page.'],
          ['list', [
            '<b>Shared logins</b> (shop Wi-Fi, vendor accounts, tool licences) are in the team password manager, one collection per subteam. Use the free Bitwarden app and choose <b>Self-hosted</b> when signing in.',
            '<b>Your own account</b> for services that give everyone one: Onshape, GitHub, the team’s social media. Ask your lead to add you.',
            '<b>Mentors only</b>: the FIRST dashboard, money and school accounts.',
          ]],
          ['warn', 'Never paste a team password into the hub, a task, or a group chat. Nobody, including mentors, can recover a forgotten master password.'],
        ],
      },
    ],
  },

  {
    title: 'Roles and permissions',
    appendix: 'A',
    sections: [
      {
        title: 'What each role can do',
        blocks: [
          ['table', ['', 'Member', 'Lead', 'Mentor'], [
            ['See all boards; create, edit and finish tasks', '✓', '✓', '✓'],
            ['Delete a task', 'own', '✓', '✓'],
            ['Create boards; groups, columns, labels, automations', '', '✓', '✓'],
            ['Delete a board', '', '', '✓'],
            ['See leadership meetings', '', '✓', '✓'],
            ['See mentor meetings', '', '', '✓'],
            ['Schedule and run meetings', 'if facilitator', '✓', '✓'],
            ['Check yourself in to a meeting', '✓', '✓', '✓'],
            ['Set up the shop tablet', '', '✓', '✓'],
            ['Sign yourself up for a trip', '✓', '✓', '✓'],
            ['Manage a trip roster; tick ordinary checklist items', '', '✓', '✓'],
            ['Tick permission slips, fees and medical forms', '', '', '✓'],
            ['Borrow and return equipment for yourself', '✓', '✓', '✓'],
            ['Add and edit equipment; lend to anyone', '', '✓', '✓'],
            ['Submit expenses', '✓', '✓', '✓'],
            ['Approve expenses; set budgets', '', '', '✓'],
            ['See workload and attendance for everyone', '', '✓', '✓'],
            ['See teammates’ email addresses', 'own', '✓', '✓'],
            ['Add and remove people; change roles', '', '', '✓'],
            ['Audit log and backups', '', '', '✓'],
          ], 'matrix'],
          ['p', 'Roles are checked on every click, so removing someone or changing their role takes effect straight away.'],
        ],
      },
    ],
  },

  {
    title: 'Troubleshooting',
    appendix: 'B',
    sections: [
      {
        title: 'Common questions',
        blocks: [
          ['table', ['Problem', 'What to do'], [
            ['I can’t sign in.', 'A mentor has to add your email first, and you must use exactly that address.'],
            ['I can’t mark my task Done.', `The board needs approval. Click ${ui('Submit for review')}; your reviewer, a lead or a mentor marks it Done.`],
            ['I don’t get notifications on my phone.', `Open the hub from its Home Screen icon, go to Inbox and tap ${ui('Turn on')}. Check the phone allows notifications for it. On iPhone it needs iOS 16.4 or newer.`],
            ['I forgot to check in.', 'Ask whoever ran the meeting to mark you present.'],
            ['I can’t see a meeting someone mentioned.', 'Leadership meetings are for leads and mentors; mentor meetings for mentors.'],
            ['I deleted a task by mistake.', `Click ${ui('Undo')} straight away, or ask a lead to restore it from the board’s Trash (30 days).`],
            ['The trip is full.', 'Join the waitlist. You’ll be told if a place opens up.'],
            ['My hours look wrong.', 'Check you checked out (or in) at each meeting. The person who ran it can correct attendance.'],
            ['Where do I put a password?', 'Not in the hub. Shared logins go in the team password manager; ask your lead.'],
          ]],
        ],
      },
    ],
  },
]
