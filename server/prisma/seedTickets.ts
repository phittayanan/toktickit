import type { ActionTakenStatus, Priority, TicketStatus } from '../generated/prisma/client'

// A Public Comment or an Internal Note of a seed Ticket.
interface SeedEntry {
  author: string
  body: string
  at: string
}

// An Action Taken of a seed Ticket. It starts at version 1, so it is as the
// API would have created it.
interface SeedActionTaken {
  status: ActionTakenStatus
  description: string
  result?: string
  assignee: string
  createdBy: string
  actionAt: string
  followUpRequired?: boolean
  followUpNote?: string
  attachmentNotes?: string
  createdAt: string
}

export interface SeedTicket {
  requester: string
  category: string
  relatedSystem: string
  summary: string
  description: string
  requestedPriority: Priority
  // Omitted where staff never changed it: it is then the Requested
  // Priority (BR-26).
  itPriority?: Priority
  status: TicketStatus
  owner?: string
  ownerChangedAt?: string
  resolutionSummary?: string
  resolvedAt?: string
  requesterResolvedAt?: string
  createdAt: string
  updatedAt: string
  comments?: SeedEntry[]
  notes?: SeedEntry[]
  actionsTaken?: SeedActionTaken[]
}

const SOMCHAI = 'somchai.jaidee@kmutt.ac.th'
const NALINEE = 'nalinee.suksawat@kmutt.ac.th'
const KITTIPONG = 'kittipong.rattanakosin@kmutt.ac.th'
const PLOY = 'ploy.wongsawang@kmutt.ac.th'
const WICHAI = 'wichai.phromma@kmutt.ac.th'
const SIRIPORN = 'siriporn.kaewmanee@kmutt.ac.th'
const THANAKORN = 'thanakorn.srisuk@kmutt.ac.th'
const PRANEE = 'pranee.chaiyasit@kmutt.ac.th'
const APINYA = 'apinya.thongchai@kmutt.ac.th'

// A time in September 2026, Bangkok time.
function at(day: number, time: string): string {
  return `2026-09-${String(day).padStart(2, '0')}T${time}:00+07:00`
}

// A time relative to this seed run. The Lab 4 Tickets use it, so that they
// fall in the recent window of the dashboards (specification.md §7.5).
const SEED_RUN = Date.now()
const HOUR = 60 * 60 * 1000

function hoursAgo(hours: number): string {
  return new Date(SEED_RUN - hours * HOUR).toISOString()
}

// Lab 3 specification.md §7.4. A Ticket's position here is its Ticket Number:
// the first is TKT-2026-900001. Add new Tickets at the end, so that the
// numbers of the existing ones never move.
//
// Each Ticket is in a state the workflow can reach: a New Ticket has no
// owner (BR-24), a Resolved, Closed, or Reopened one carries its latest
// resolution (BR-29), only an unfinished and unresolved Ticket is flagged
// as appearing resolved (BR-33), and the inactive IT Staff user owns
// finished Tickets only (BR-25).
export const SEED_TICKETS: SeedTicket[] = [
  // New: nobody has picked these up.
  {
    requester: SOMCHAI,
    category: 'Network',
    relatedSystem: 'Wi-Fi',
    summary: 'Wi-Fi drops in the library reading room',
    description:
      'The connection drops every few minutes on the second floor of the library, near the reading room windows. Other floors are fine.',
    requestedPriority: 'MEDIUM',
    status: 'NEW',
    createdAt: at(28, '09:10'),
    updatedAt: at(28, '09:10'),
  },
  {
    requester: NALINEE,
    category: 'Account and Access',
    relatedSystem: 'Student Portal',
    summary: 'Cannot sign in to the Student Portal after changing my password',
    description:
      'I changed my password yesterday. The portal now rejects both the old and the new password, while email accepts the new one.',
    requestedPriority: 'HIGH',
    status: 'NEW',
    createdAt: at(28, '10:25'),
    updatedAt: at(28, '10:25'),
  },
  {
    requester: KITTIPONG,
    category: 'Hardware',
    relatedSystem: 'Printing',
    summary: 'Printer on the fourth floor prints blank pages',
    description: 'Every job sent to the fourth-floor printer comes out blank. The toner level shows as half full.',
    requestedPriority: 'LOW',
    status: 'NEW',
    createdAt: at(28, '13:40'),
    updatedAt: at(28, '13:40'),
  },
  {
    requester: PLOY,
    category: 'Software',
    relatedSystem: 'Learning Management System',
    summary: 'Assignment upload fails with a timeout',
    description:
      'Uploading a 40 MB project report to the assignment page runs for about two minutes and then shows a timeout error.',
    requestedPriority: 'MEDIUM',
    status: 'NEW',
    createdAt: at(29, '08:15'),
    updatedAt: at(29, '08:50'),
    comments: [{ author: PLOY, body: 'The deadline is this Friday, so I will need a way to submit before then.', at: at(29, '08:50') }],
  },

  // Open.
  {
    requester: SOMCHAI,
    category: 'Account and Access',
    relatedSystem: 'Email',
    summary: 'Mailbox quota warning although the mailbox is nearly empty',
    description: 'I receive a daily warning that my mailbox is 95% full, but it holds fewer than a hundred messages.',
    requestedPriority: 'LOW',
    status: 'OPEN',
    owner: WICHAI,
    ownerChangedAt: at(25, '11:00'),
    createdAt: at(25, '09:30'),
    updatedAt: at(25, '11:00'),
  },
  {
    requester: NALINEE,
    category: 'Network',
    relatedSystem: 'VPN',
    summary: 'VPN refuses the connection from off campus',
    description: 'Since Monday the VPN client reports "connection refused" from my home network. It still works on campus.',
    requestedPriority: 'HIGH',
    status: 'OPEN',
    owner: SIRIPORN,
    ownerChangedAt: at(26, '09:05'),
    createdAt: at(25, '19:45'),
    updatedAt: at(26, '09:05'),
    notes: [{ author: SIRIPORN, body: 'Third report this week from the same residential provider. Check the gateway allow list.', at: at(26, '09:20') }],
  },
  {
    requester: KITTIPONG,
    category: 'Software',
    relatedSystem: 'Learning Management System',
    summary: 'Course materials show the wrong semester',
    description: 'The materials page of my course lists the files of last semester instead of the current one.',
    requestedPriority: 'MEDIUM',
    itPriority: 'LOW',
    status: 'OPEN',
    owner: THANAKORN,
    ownerChangedAt: at(24, '14:10'),
    createdAt: at(24, '10:00'),
    updatedAt: at(24, '14:30'),
    notes: [{ author: THANAKORN, body: 'Display issue only: the current files are reachable from the course home page. Lowered the priority.', at: at(24, '14:30') }],
  },
  {
    requester: PLOY,
    category: 'Hardware',
    relatedSystem: 'Printing',
    summary: 'Card reader on the library printer does not respond',
    description: 'Tapping my student card on the library printer does nothing, so I cannot release my print jobs.',
    requestedPriority: 'MEDIUM',
    status: 'OPEN',
    ownerChangedAt: at(23, '16:00'),
    requesterResolvedAt: at(24, '09:15'),
    createdAt: at(22, '15:20'),
    updatedAt: at(24, '09:15'),
    comments: [
      { author: THANAKORN, body: 'The reader has been restarted. Please try again and tell us whether it reads your card.', at: at(23, '11:30') },
      { author: PLOY, body: 'It read my card this morning and my jobs printed.', at: at(24, '09:10') },
    ],
    notes: [{ author: THANAKORN, body: 'Returning this to the queue: I am away for the rest of the week.', at: at(23, '16:00') }],
  },

  // In Progress.
  {
    requester: SOMCHAI,
    category: 'Hardware',
    relatedSystem: 'Wi-Fi',
    summary: 'Laptop cannot see the campus Wi-Fi network',
    description: 'My office laptop lists neighbouring networks but not the campus one. My phone connects from the same desk.',
    requestedPriority: 'HIGH',
    status: 'IN_PROGRESS',
    owner: WICHAI,
    ownerChangedAt: at(21, '09:40'),
    createdAt: at(21, '08:55'),
    updatedAt: at(22, '10:05'),
    comments: [
      { author: WICHAI, body: 'Which model is the laptop, and when did it last connect?', at: at(21, '09:45') },
      { author: SOMCHAI, body: 'It is a 2023 model from the faculty pool. It last connected on Friday.', at: at(22, '10:05') },
    ],
    notes: [{ author: WICHAI, body: 'The wireless driver was replaced by an update on Saturday. Rolling it back on the bench.', at: at(22, '13:30') }],
  },
  {
    requester: NALINEE,
    category: 'Software',
    relatedSystem: 'Email',
    summary: 'Email client keeps asking for the password',
    description: 'The desktop email client asks for my password every few minutes, although the password is correct.',
    requestedPriority: 'MEDIUM',
    status: 'IN_PROGRESS',
    owner: SIRIPORN,
    ownerChangedAt: at(20, '10:15'),
    requesterResolvedAt: at(23, '08:40'),
    createdAt: at(19, '16:30'),
    updatedAt: at(23, '08:40'),
    comments: [
      { author: SIRIPORN, body: 'Your account profile has been rebuilt. Please restart the client and sign in once more.', at: at(22, '15:00') },
      { author: NALINEE, body: 'No password prompt since yesterday afternoon.', at: at(23, '08:38') },
    ],
  },
  {
    requester: KITTIPONG,
    category: 'Network',
    relatedSystem: 'Wi-Fi',
    summary: 'Slow Wi-Fi in the main lecture hall',
    description: 'During lectures the Wi-Fi in the main lecture hall is too slow to open the course pages.',
    requestedPriority: 'LOW',
    itPriority: 'HIGH',
    status: 'IN_PROGRESS',
    owner: THANAKORN,
    ownerChangedAt: at(18, '09:00'),
    createdAt: at(17, '14:20'),
    updatedAt: at(18, '09:35'),
    notes: [{ author: THANAKORN, body: 'Affects every lecture in the hall, about 300 people at a time. Raised the priority.', at: at(18, '09:35') }],
  },
  {
    requester: PLOY,
    category: 'Account and Access',
    relatedSystem: 'Student Portal',
    summary: 'Name is misspelled on the portal profile',
    description: 'My family name is missing a letter on the Student Portal profile page and on generated documents.',
    requestedPriority: 'LOW',
    status: 'IN_PROGRESS',
    owner: WICHAI,
    ownerChangedAt: at(16, '13:10'),
    createdAt: at(16, '11:05'),
    updatedAt: at(17, '09:00'),
  },

  // Waiting for Requester.
  {
    requester: SOMCHAI,
    category: 'Software',
    relatedSystem: 'Learning Management System',
    summary: 'Quiz closes before the timer ends',
    description: 'A timed quiz I set for 30 minutes closed for several students after about 20 minutes.',
    requestedPriority: 'HIGH',
    status: 'WAITING_FOR_REQUESTER',
    owner: SIRIPORN,
    ownerChangedAt: at(15, '10:30'),
    createdAt: at(15, '09:50'),
    updatedAt: at(16, '14:20'),
    comments: [{ author: SIRIPORN, body: 'Which quiz was it, and can you name two of the students affected so we can read their attempt logs?', at: at(16, '14:20') }],
  },
  {
    requester: NALINEE,
    category: 'Hardware',
    relatedSystem: 'Printing',
    summary: 'Print jobs come out with grey streaks',
    description: 'Pages from the department printer have grey vertical streaks down the left side.',
    requestedPriority: 'LOW',
    status: 'WAITING_FOR_REQUESTER',
    owner: THANAKORN,
    ownerChangedAt: at(14, '09:15'),
    createdAt: at(11, '15:40'),
    updatedAt: at(15, '11:10'),
    comments: [{ author: THANAKORN, body: 'The drum was cleaned today. Please print a test page and tell us whether the streaks are gone.', at: at(15, '11:10') }],
  },
  {
    requester: KITTIPONG,
    category: 'Account and Access',
    relatedSystem: 'VPN',
    summary: 'VPN access needed for a new research assistant',
    description: 'A research assistant joined my project this month and needs VPN access to the lab servers.',
    requestedPriority: 'MEDIUM',
    status: 'WAITING_FOR_REQUESTER',
    owner: SIRIPORN,
    ownerChangedAt: at(11, '10:00'),
    createdAt: at(10, '16:10'),
    updatedAt: at(14, '13:45'),
    comments: [{ author: SIRIPORN, body: 'We need the signed access form from your head of department before the account can be enabled.', at: at(14, '13:45') }],
    notes: [{ author: APINYA, body: 'Do not enable without the form. The previous request for this lab was approved by email only.', at: at(14, '14:00') }],
  },

  // Resolved.
  {
    requester: PLOY,
    category: 'Network',
    relatedSystem: 'VPN',
    summary: 'VPN disconnects every few minutes',
    description: 'The VPN connects but drops after three or four minutes, on both my laptop and my tablet.',
    requestedPriority: 'MEDIUM',
    status: 'RESOLVED',
    owner: THANAKORN,
    ownerChangedAt: at(8, '09:30'),
    resolutionSummary: 'Your VPN profile used an old gateway address. It now points at the current gateway and the session stays up.',
    resolvedAt: at(10, '15:00'),
    createdAt: at(7, '18:20'),
    updatedAt: at(10, '15:00'),
  },
  {
    requester: SOMCHAI,
    category: 'Account and Access',
    relatedSystem: 'Email',
    summary: 'Shared mailbox is not listed in my email client',
    description: 'I was added to the department shared mailbox last week, but it does not appear in my email client.',
    requestedPriority: 'MEDIUM',
    status: 'RESOLVED',
    owner: WICHAI,
    ownerChangedAt: at(9, '08:45'),
    resolutionSummary: 'The permission had been granted to a similarly named account. It is now on yours and the mailbox appears after a restart.',
    resolvedAt: at(9, '16:20'),
    createdAt: at(8, '14:00'),
    updatedAt: at(10, '09:05'),
    comments: [{ author: SOMCHAI, body: 'I can open the shared mailbox now. Thank you.', at: at(10, '09:05') }],
  },
  {
    requester: NALINEE,
    category: 'Software',
    relatedSystem: 'Student Portal',
    summary: 'Transcript download returns an error page',
    description: 'Choosing "Download transcript" on the Student Portal opens an error page instead of the file.',
    requestedPriority: 'HIGH',
    status: 'RESOLVED',
    ownerChangedAt: at(12, '17:00'),
    resolutionSummary: 'The transcript service had stopped after maintenance. It was restarted and downloads work again.',
    resolvedAt: at(5, '11:30'),
    createdAt: at(4, '09:00'),
    updatedAt: at(12, '17:00'),
    notes: [{ author: PRANEE, body: 'Restarted the transcript service; it had not come back after the maintenance window.', at: at(5, '11:25') }],
  },

  // Reopened: the problem returned after a resolution.
  {
    requester: KITTIPONG,
    category: 'Hardware',
    relatedSystem: 'Printing',
    summary: 'Printer queue is stuck on the third floor',
    description: 'Jobs sent to the third-floor printer stay in the queue and never print.',
    requestedPriority: 'MEDIUM',
    status: 'REOPENED',
    owner: WICHAI,
    ownerChangedAt: at(3, '10:20'),
    resolutionSummary: 'A corrupt job was blocking the queue. It was removed and the waiting jobs printed.',
    resolvedAt: at(3, '15:10'),
    createdAt: at(3, '09:30'),
    updatedAt: at(8, '10:00'),
    comments: [{ author: KITTIPONG, body: 'The queue is stuck again this morning, with eleven jobs waiting.', at: at(8, '09:40') }],
  },
  {
    requester: PLOY,
    category: 'Network',
    relatedSystem: 'Wi-Fi',
    summary: 'Wi-Fi sign-in fails on my phone',
    description: 'My phone shows "authentication failed" when joining the campus Wi-Fi. My laptop joins without trouble.',
    requestedPriority: 'LOW',
    status: 'REOPENED',
    owner: SIRIPORN,
    ownerChangedAt: at(2, '13:00'),
    resolutionSummary: 'The saved network profile on the phone was out of date. Removing and re-adding the network fixed the sign-in.',
    resolvedAt: at(2, '15:45'),
    createdAt: at(2, '11:15'),
    updatedAt: at(7, '09:30'),
    comments: [{ author: PLOY, body: 'It failed again after the phone updated its system software.', at: at(7, '08:55') }],
  },

  // Closed.
  {
    requester: SOMCHAI,
    category: 'Hardware',
    relatedSystem: 'Printing',
    summary: 'Label printer in the registrar office is offline',
    description: 'The label printer at the registrar front desk shows as offline on every computer in the office.',
    requestedPriority: 'LOW',
    status: 'CLOSED',
    owner: PRANEE,
    ownerChangedAt: at(1, '10:10'),
    resolutionSummary: 'The network cable had been unplugged during an office move. It was reconnected and the printer is online.',
    resolvedAt: at(1, '14:30'),
    createdAt: at(1, '09:20'),
    updatedAt: at(3, '09:00'),
  },
  {
    requester: NALINEE,
    category: 'Account and Access',
    relatedSystem: 'Learning Management System',
    summary: 'Cannot open a course I am enrolled in',
    description: 'The course appears on my enrolment list, but opening it shows "You are not enrolled in this course".',
    requestedPriority: 'MEDIUM',
    status: 'CLOSED',
    owner: THANAKORN,
    ownerChangedAt: at(1, '13:20'),
    resolutionSummary: 'The enrolment had not been copied to the learning system. It was synchronised and the course opens.',
    resolvedAt: at(2, '10:00'),
    createdAt: at(1, '11:45'),
    updatedAt: at(4, '08:30'),
    comments: [{ author: NALINEE, body: 'The course opens now.', at: at(2, '13:15') }],
  },

  // Cancelled.
  {
    requester: KITTIPONG,
    category: 'Software',
    relatedSystem: 'Email',
    summary: 'Install a calendar add-in for the email client',
    description: 'Please install the room-booking calendar add-in in my email client.',
    requestedPriority: 'LOW',
    status: 'CANCELLED',
    createdAt: at(9, '13:00'),
    updatedAt: at(9, '15:30'),
    comments: [{ author: APINYA, body: 'The add-in is already available to everyone from the add-in store, so no installation is needed. Cancelling this request.', at: at(9, '15:25') }],
  },
  {
    requester: PLOY,
    category: 'Network',
    relatedSystem: 'VPN',
    summary: 'VPN access for an exchange semester abroad',
    description: 'I will study abroad next semester and would like VPN access to the library databases from there.',
    requestedPriority: 'MEDIUM',
    status: 'CANCELLED',
    owner: SIRIPORN,
    ownerChangedAt: at(4, '10:40'),
    createdAt: at(4, '09:35'),
    updatedAt: at(6, '11:00'),
    comments: [{ author: PLOY, body: 'My exchange has been postponed, so please cancel this request.', at: at(6, '10:20') }],
  },

  // Lab 4 (specification.md §7.5): the Tickets with Actions Taken, dated by
  // the seed run. The ones above have none, and show legacy behaviour.

  // Passes the Resolution Gate: a Done action, and nothing Planned.
  {
    requester: SOMCHAI,
    category: 'Hardware',
    relatedSystem: 'Printing',
    summary: 'Laptop battery drains within an hour',
    description: 'My laptop battery falls from full to empty in about an hour, even with the screen dimmed.',
    requestedPriority: 'HIGH',
    status: 'IN_PROGRESS',
    owner: WICHAI,
    ownerChangedAt: hoursAgo(100),
    createdAt: hoursAgo(110),
    updatedAt: hoursAgo(30),
    actionsTaken: [
      {
        status: 'CANCELLED',
        description: 'Recalibrate the battery overnight.',
        assignee: SIRIPORN,
        createdBy: WICHAI,
        actionAt: hoursAgo(90),
        createdAt: hoursAgo(96),
      },
      {
        status: 'DONE',
        description: 'Replaced the laptop battery.',
        result: 'Charge now holds for seven hours.',
        assignee: WICHAI,
        createdBy: WICHAI,
        actionAt: hoursAgo(32),
        followUpRequired: true,
        followUpNote: 'Check the charge again next week.',
        attachmentNotes: 'See the battery report on the asset sheet.',
        createdAt: hoursAgo(30),
      },
    ],
  },

  // Blocked by the gate: a Planned action remains.
  {
    requester: SOMCHAI,
    category: 'Network',
    relatedSystem: 'Wi-Fi',
    summary: 'Wi-Fi keeps dropping in the engineering lobby',
    description: 'The connection drops every few minutes in the second-floor lobby of the engineering building.',
    requestedPriority: 'MEDIUM',
    status: 'IN_PROGRESS',
    owner: WICHAI,
    ownerChangedAt: hoursAgo(70),
    createdAt: hoursAgo(75),
    updatedAt: hoursAgo(20),
    actionsTaken: [
      {
        status: 'DONE',
        description: 'Restarted the access point on the second floor.',
        result: 'The connection held for an hour, then dropped again.',
        assignee: WICHAI,
        createdBy: WICHAI,
        actionAt: hoursAgo(48),
        createdAt: hoursAgo(47),
      },
      {
        status: 'PLANNED',
        description: 'Replace the access point on the second floor.',
        assignee: SIRIPORN,
        createdBy: WICHAI,
        actionAt: hoursAgo(-24),
        createdAt: hoursAgo(20),
      },
    ],
  },

  // Blocked by the gate: no Done action.
  {
    requester: NALINEE,
    category: 'Software',
    relatedSystem: 'Student Portal',
    summary: 'Grades page shows an error',
    description: 'Opening the grades page in the student portal shows "Something went wrong" since this morning.',
    requestedPriority: 'LOW',
    status: 'IN_PROGRESS',
    owner: SIRIPORN,
    ownerChangedAt: hoursAgo(60),
    createdAt: hoursAgo(62),
    updatedAt: hoursAgo(40),
    actionsTaken: [
      {
        status: 'CANCELLED',
        description: 'Clear the portal cache.',
        assignee: SIRIPORN,
        createdBy: SIRIPORN,
        actionAt: hoursAgo(41),
        createdAt: hoursAgo(44),
      },
    ],
  },

  // Waits on the Requester, with one Planned action in the future.
  {
    requester: SOMCHAI,
    category: 'Account and Access',
    relatedSystem: 'Email',
    summary: 'Need access to the department shared mailbox',
    description: 'I have joined the registrar team and need access to its shared mailbox.',
    requestedPriority: 'MEDIUM',
    status: 'WAITING_FOR_REQUESTER',
    owner: WICHAI,
    ownerChangedAt: hoursAgo(50),
    createdAt: hoursAgo(54),
    updatedAt: hoursAgo(10),
    comments: [{ author: WICHAI, body: 'Please ask your head of department to confirm the access.', at: hoursAgo(10) }],
    actionsTaken: [
      {
        status: 'PLANNED',
        description: 'Grant access once the head of department confirms.',
        assignee: WICHAI,
        createdBy: WICHAI,
        actionAt: hoursAgo(-48),
        createdAt: hoursAgo(11),
      },
    ],
  },

  // Recently Resolved and Closed, through the gate.
  {
    requester: SOMCHAI,
    category: 'Software',
    relatedSystem: 'VPN',
    summary: 'VPN client asks for an update it cannot install',
    description: 'The VPN client asks me to update, and the installer stops with an error halfway through.',
    requestedPriority: 'MEDIUM',
    status: 'RESOLVED',
    owner: SIRIPORN,
    ownerChangedAt: hoursAgo(80),
    resolutionSummary: 'Removed the old client and installed the current version, which connects normally.',
    resolvedAt: hoursAgo(26),
    createdAt: hoursAgo(84),
    updatedAt: hoursAgo(26),
    actionsTaken: [
      {
        status: 'DONE',
        description: 'Removed the old client and installed the current version.',
        result: 'The client connects and the update prompt is gone.',
        assignee: SIRIPORN,
        createdBy: SIRIPORN,
        actionAt: hoursAgo(28),
        createdAt: hoursAgo(27),
      },
    ],
  },
  {
    requester: SOMCHAI,
    category: 'Hardware',
    relatedSystem: 'Printing',
    summary: 'Office printer leaves streaks on every page',
    description: 'Everything printed on the office printer has a grey streak down the left of the page.',
    requestedPriority: 'LOW',
    status: 'CLOSED',
    owner: WICHAI,
    ownerChangedAt: hoursAgo(120),
    resolutionSummary: 'Replaced the toner cartridge and cleaned the drum. Test pages print clean.',
    resolvedAt: hoursAgo(66),
    createdAt: hoursAgo(124),
    updatedAt: hoursAgo(46),
    actionsTaken: [
      {
        status: 'DONE',
        description: 'Replaced the toner cartridge and cleaned the drum.',
        result: 'Test pages print clean.',
        assignee: THANAKORN,
        createdBy: WICHAI,
        actionAt: hoursAgo(68),
        createdAt: hoursAgo(67),
      },
    ],
  },

  // New and unassigned: an Action Taken needs no Ticket Owner (BR-02).
  {
    requester: NALINEE,
    category: 'Network',
    relatedSystem: 'Wi-Fi',
    summary: 'Guest Wi-Fi for a visiting lecturer',
    description: 'A visiting lecturer arrives next week and needs guest Wi-Fi access for three days.',
    requestedPriority: 'LOW',
    status: 'NEW',
    createdAt: hoursAgo(9),
    updatedAt: hoursAgo(8),
    actionsTaken: [
      {
        status: 'PLANNED',
        description: 'Prepare a guest account before the visit.',
        assignee: SIRIPORN,
        createdBy: SIRIPORN,
        actionAt: hoursAgo(-72),
        createdAt: hoursAgo(8),
      },
    ],
  },
]
