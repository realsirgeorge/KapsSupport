import 'dotenv/config';
import { AppDataSource } from './data-source';
import * as bcrypt from 'bcryptjs';

const PASSWORD = 'Password123!';

const TEAMS = [
  'Fintech Support',
  'Technical Operations',
  'ICT',
  'Customer Success',
  'Platform Engineering',
];

const SITES = [
  { name: 'Westgate', region: 'Nairobi' },
  { name: 'Downtown', region: 'Nairobi' },
  { name: 'Airport', region: 'Nairobi' },
  { name: 'Riverside', region: 'Mombasa' },
  { name: 'Northgate', region: 'Kisumu' },
];

// One category per team, same name as the team's short label so the
// "category => team" 1:1 relationship the app assumes stays obvious.
const CATEGORY_LABELS: Record<string, string> = {
  'Fintech Support': 'Fintech',
  'Technical Operations': 'Technical',
  ICT: 'ICT',
  'Customer Success': 'Customer Success',
  'Platform Engineering': 'Platform Engineering',
};

const FIRST_NAMES = [
  'Rita', 'Mo', 'Mia', 'Sam', 'Ada', 'Alex', 'Priya', 'Jordan', 'Kwame', 'Lena',
  'Noah', 'Zara', 'Diego', 'Fatima', 'Owen', 'Chloe', 'Ravi', 'Tariq', 'Ines', 'Bram',
  'Yara', 'Elan', 'Nadia', 'Femi', 'Sven', 'Aiko', 'Milo', 'Petra', 'Kai', 'Rosa',
  'Dax', 'Wren', 'Iris', 'Leo', 'Sasha', 'Bao', 'Nia', 'Otis', 'Vera', 'Zane',
  'Amara', 'Osei', 'Chen', 'Boateng', 'Ortiz',
];

let firstNameIdx = 0;
function nextFirstName(): string {
  return FIRST_NAMES[firstNameIdx++ % FIRST_NAMES.length];
}

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const SUBJECTS = [
  'POS terminal offline',
  'Reconciliation mismatch',
  'New starter needs access',
  'Card reader intermittent fault',
  'Network drop at site',
  'Printer offline',
  'VPN connection failing',
  'Password reset request',
  'Invoice export contains duplicate rows',
  'Webhook delivery latency above threshold',
  'SSO provisioning fails for new analysts',
  'Cannot access quarterly audit workspace',
  'Laptop won\'t boot after update',
  'Shared drive permissions incorrect',
  'Mobile app crashes on login',
  'Email sync delayed by several hours',
  'Payment gateway timeout',
  'Backup job failed overnight',
  'Monitor flickering intermittently',
  'Badge reader not registering swipes',
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursAgo(n: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d;
}

async function seed() {
  await AppDataSource.initialize();
  const password_hash = await bcrypt.hash(PASSWORD, 10);

  console.log('--- Teams, sites, categories ---');
  const teamIds: Record<string, string> = {};
  for (const name of TEAMS) {
    const [team] = await AppDataSource.query(
      `INSERT INTO teams (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name],
    );
    teamIds[name] = team.id;
  }

  const siteIds: string[] = [];
  for (const s of SITES) {
    const [existing] = await AppDataSource.query('SELECT id FROM sites WHERE name = $1', [s.name]);
    if (existing) {
      siteIds.push(existing.id);
      continue;
    }
    const [site] = await AppDataSource.query(
      'INSERT INTO sites (name, region) VALUES ($1, $2) RETURNING id',
      [s.name, s.region],
    );
    siteIds.push(site.id);
  }

  const categoryIds: Record<string, string> = {}; // by team name
  for (const teamName of TEAMS) {
    const label = CATEGORY_LABELS[teamName];
    const [cat] = await AppDataSource.query(
      `INSERT INTO categories (name, team_id) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET team_id = EXCLUDED.team_id
       RETURNING id`,
      [label, teamIds[teamName]],
    );
    categoryIds[teamName] = cat.id;
  }
  console.log(`${TEAMS.length} teams, ${siteIds.length} sites, ${TEAMS.length} categories ready.`);

  console.log('--- Users ---');
  async function upsertUser(
    email: string,
    name: string,
    flags: { team_id?: string; is_support_triage?: boolean; is_admin?: boolean; is_executive?: boolean; is_unavailable?: boolean },
  ): Promise<string> {
    const [row] = await AppDataSource.query(
      `INSERT INTO users (name, email, password_hash, team_id, is_support_triage, is_admin, is_executive, is_unavailable)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         team_id = EXCLUDED.team_id,
         is_support_triage = EXCLUDED.is_support_triage,
         is_admin = EXCLUDED.is_admin,
         is_executive = EXCLUDED.is_executive
       RETURNING id`,
      [
        name,
        email,
        password_hash,
        flags.team_id || null,
        !!flags.is_support_triage,
        !!flags.is_admin,
        !!flags.is_executive,
        !!flags.is_unavailable,
      ],
    );
    return row.id;
  }

  // Requesters (5)
  const requesterIds: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const name = `${nextFirstName()} Requester${i}`;
    const id = await upsertUser(`requester${i}@example.com`, name, {});
    requesterIds.push(id);
  }

  // Managers (one per team, 5 teams = 5 managers)
  const managerIds: Record<string, string> = {};
  let mgrNum = 1;
  for (const teamName of TEAMS) {
    const name = `${nextFirstName()} Manager${mgrNum}`;
    const email = `manager${mgrNum}@example.com`;
    const id = await upsertUser(email, name, { team_id: teamIds[teamName] });
    managerIds[teamName] = id;
    await AppDataSource.query('UPDATE teams SET manager_id = $1 WHERE id = $2', [id, teamIds[teamName]]);
    mgrNum++;
  }

  // Team members (4 per team = 20), a couple marked unavailable via a
  // simulated approved leave request (matches what the real approval flow
  // would have produced -- FR-10.10 says only that flow may set the flag,
  // which this seed step honors in spirit even though it writes directly).
  const teamMemberIds: Record<string, string[]> = {};
  let memberNum = 1;
  for (const teamName of TEAMS) {
    teamMemberIds[teamName] = [];
    for (let i = 0; i < 4; i++) {
      const unavailable = memberNum % 7 === 0; // sprinkle a few
      const name = `${nextFirstName()} Member${memberNum}`;
      const email = `member${memberNum}@example.com`;
      const id = await upsertUser(email, name, { team_id: teamIds[teamName], is_unavailable: unavailable });
      if (unavailable) {
        await AppDataSource.query(
          `INSERT INTO availability_requests (user_id, type, status, requested_at, decided_by, decided_at)
           VALUES ($1, 'toggle', 'approved', now() - interval '2 days', $2, now() - interval '2 days')`,
          [id, managerIds[teamName]],
        );
      }
      teamMemberIds[teamName].push(id);
      memberNum++;
    }
  }
  const allTeamMemberIds = Object.values(teamMemberIds).flat();

  // Support/Triage (5) -- exceeds FR-2.7's real-world "<5" staffing
  // guidance deliberately, for wider test coverage across this seed data.
  const supportIds: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const name = `${nextFirstName()} Support${i}`;
    const id = await upsertUser(`support${i}@example.com`, name, { is_support_triage: true });
    supportIds.push(id);
  }

  // Admin (5, read/write) and Executive (5, read-only) -- kept as
  // distinct pools so each sub-role individually has 5+ real accounts.
  const adminIds: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const name = `${nextFirstName()} Admin${i}`;
    const id = await upsertUser(`admin${i}@example.com`, name, { is_admin: true });
    adminIds.push(id);
  }
  const executiveIds: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const name = `${nextFirstName()} Executive${i}`;
    const id = await upsertUser(`executive${i}@example.com`, name, { is_executive: true });
    executiveIds.push(id);
  }

  console.log(
    `${requesterIds.length} requesters, ${Object.keys(managerIds).length} managers, ` +
      `${allTeamMemberIds.length} team members, ${supportIds.length} support/triage, ` +
      `${adminIds.length} admin, ${executiveIds.length} executive.`,
  );

  console.log('--- Tickets ---');

  function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  const year = new Date().getFullYear();
  const [lastTicket] = await AppDataSource.query(
    `SELECT ticket_number FROM tickets WHERE ticket_number LIKE $1 ORDER BY ticket_number DESC LIMIT 1`,
    [`TCK-${year}-%`],
  );
  let ticketSeq = lastTicket ? parseInt(lastTicket.ticket_number.split('-')[2], 10) + 1 : 1;
  function nextTicketNumber(): string {
    return `TCK-${year}-${String(ticketSeq++).padStart(5, '0')}`;
  }

  async function insertTicket(fields: {
    requester_id: string;
    site_id: string;
    subject: string;
    description?: string;
    suggested_category_id?: string | null;
    confirmed_category_id?: string | null;
    suggested_priority?: string | null;
    confirmed_priority?: string | null;
    assigned_to?: string | null;
    assigned_by?: string | null;
    assigned_at?: Date | null;
    status: string;
    pending_reason?: string | null;
    created_at: Date;
    resolved_at?: Date | null;
    pending_confirmation_at?: Date | null;
    closed_at?: Date | null;
  }) {
    await AppDataSource.query(
      `INSERT INTO tickets (
        ticket_number, requester_id, site_id, subject, description,
        suggested_category_id, confirmed_category_id, suggested_priority, confirmed_priority,
        assigned_to, assigned_by, assigned_at, status, pending_reason,
        created_at, updated_at, resolved_at, pending_confirmation_at, closed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16,$17,$18)`,
      [
        nextTicketNumber(),
        fields.requester_id,
        fields.site_id,
        fields.subject,
        `${fields.subject} -- reported by requester, needs support attention.`,
        fields.suggested_category_id ?? null,
        fields.confirmed_category_id ?? null,
        fields.suggested_priority ?? null,
        fields.confirmed_priority ?? null,
        fields.assigned_to ?? null,
        fields.assigned_by ?? null,
        fields.assigned_at ?? null,
        fields.status,
        fields.pending_reason ?? null,
        fields.created_at,
        fields.resolved_at ?? null,
        fields.pending_confirmation_at ?? null,
        fields.closed_at ?? null,
      ],
    );
  }

  let ticketCount = 0;

  // Helper: pick a team + its category + a member of that team.
  function randomTeamContext() {
    const teamName = pick(TEAMS);
    const categoryId = categoryIds[teamName];
    const members = teamMemberIds[teamName].filter((id) => true);
    const memberId = pick(members);
    return { teamName, categoryId, memberId };
  }

  // 4 x NEW: just created, no category confirmed, no assignee. Some old
  // enough to be "aging".
  for (let i = 0; i < 4; i++) {
    await insertTicket({
      requester_id: pick(requesterIds),
      site_id: pick(siteIds),
      subject: pick(SUBJECTS),
      suggested_category_id: pick(Object.values(categoryIds)),
      suggested_priority: pick(PRIORITIES),
      status: 'new',
      created_at: i === 0 ? daysAgo(4) : hoursAgo(pick([2, 6, 20, 40])),
    });
    ticketCount++;
  }

  // 4 x ASSIGNED: category confirmed, assigned, not yet started.
  for (let i = 0; i < 4; i++) {
    const { categoryId, memberId, teamName } = randomTeamContext();
    const created = i === 0 ? daysAgo(5) : hoursAgo(pick([3, 10, 30]));
    await insertTicket({
      requester_id: pick(requesterIds),
      site_id: pick(siteIds),
      subject: pick(SUBJECTS),
      suggested_category_id: categoryId,
      confirmed_category_id: categoryId,
      suggested_priority: pick(PRIORITIES),
      confirmed_priority: pick(PRIORITIES),
      assigned_to: memberId,
      assigned_by: supportIds[0],
      assigned_at: created,
      status: 'assigned',
      created_at: created,
    });
    ticketCount++;
  }

  // 5 x IN_PROGRESS
  for (let i = 0; i < 5; i++) {
    const { categoryId, memberId } = randomTeamContext();
    const created = i === 0 ? daysAgo(6) : hoursAgo(pick([5, 15, 25, 50]));
    await insertTicket({
      requester_id: pick(requesterIds),
      site_id: pick(siteIds),
      subject: pick(SUBJECTS),
      suggested_category_id: categoryId,
      confirmed_category_id: categoryId,
      suggested_priority: pick(PRIORITIES),
      confirmed_priority: pick(PRIORITIES),
      assigned_to: memberId,
      assigned_by: supportIds[1 % supportIds.length],
      assigned_at: created,
      status: 'in_progress',
      created_at: created,
    });
    ticketCount++;
  }

  // 3 x PENDING (blocked on requester/3rd party, needs a reason)
  const pendingReasons = [
    'Awaiting vendor callback',
    'Waiting on part delivery',
    'Requester has not responded to follow-up questions',
  ];
  for (let i = 0; i < 3; i++) {
    const { categoryId, memberId } = randomTeamContext();
    const created = daysAgo(pick([1, 3, 7]));
    await insertTicket({
      requester_id: pick(requesterIds),
      site_id: pick(siteIds),
      subject: pick(SUBJECTS),
      suggested_category_id: categoryId,
      confirmed_category_id: categoryId,
      suggested_priority: pick(PRIORITIES),
      confirmed_priority: pick(PRIORITIES),
      assigned_to: memberId,
      assigned_by: supportIds[2 % supportIds.length],
      assigned_at: created,
      status: 'pending',
      pending_reason: pendingReasons[i],
      created_at: created,
    });
    ticketCount++;
  }

  // 3 x RESOLVED (transient in practice, but seeded directly for display
  // coverage -- the app auto-flips this to pending_confirmation on write,
  // so a raw 'resolved' row exercises the "what if we see one anyway" path)
  for (let i = 0; i < 3; i++) {
    const { categoryId, memberId } = randomTeamContext();
    const created = daysAgo(pick([2, 4]));
    await insertTicket({
      requester_id: pick(requesterIds),
      site_id: pick(siteIds),
      subject: pick(SUBJECTS),
      suggested_category_id: categoryId,
      confirmed_category_id: categoryId,
      suggested_priority: pick(PRIORITIES),
      confirmed_priority: pick(PRIORITIES),
      assigned_to: memberId,
      assigned_by: supportIds[0],
      assigned_at: created,
      status: 'resolved',
      created_at: created,
      resolved_at: hoursAgo(pick([1, 4, 8])),
    });
    ticketCount++;
  }

  // 4 x PENDING_CONFIRMATION (some long-waiting, for the admin/exec
  // "pending confirmations sorted by wait time" view -- FR-9.6/FR-6.4)
  for (let i = 0; i < 4; i++) {
    const { categoryId, memberId } = randomTeamContext();
    const created = daysAgo(pick([3, 6, 10]));
    const resolvedAt = i === 0 ? daysAgo(9) : hoursAgo(pick([6, 20, 48]));
    await insertTicket({
      requester_id: pick(requesterIds),
      site_id: pick(siteIds),
      subject: pick(SUBJECTS),
      suggested_category_id: categoryId,
      confirmed_category_id: categoryId,
      suggested_priority: pick(PRIORITIES),
      confirmed_priority: pick(PRIORITIES),
      assigned_to: memberId,
      assigned_by: supportIds[1 % supportIds.length],
      assigned_at: created,
      status: 'pending_confirmation',
      created_at: created,
      resolved_at: resolvedAt,
      pending_confirmation_at: resolvedAt,
    });
    ticketCount++;
  }

  // 4 x CLOSED (some this month, some last month, for "closed this
  // month"/"resolved this month" counter coverage)
  for (let i = 0; i < 4; i++) {
    const { categoryId, memberId } = randomTeamContext();
    const created = daysAgo(pick([10, 20, 40]));
    const resolvedAt = i < 2 ? daysAgo(pick([1, 3])) : daysAgo(pick([35, 45]));
    await insertTicket({
      requester_id: pick(requesterIds),
      site_id: pick(siteIds),
      subject: pick(SUBJECTS),
      suggested_category_id: categoryId,
      confirmed_category_id: categoryId,
      suggested_priority: pick(PRIORITIES),
      confirmed_priority: pick(PRIORITIES),
      assigned_to: memberId,
      assigned_by: supportIds[0],
      assigned_at: created,
      status: 'closed',
      created_at: created,
      resolved_at: resolvedAt,
      pending_confirmation_at: resolvedAt,
      closed_at: resolvedAt,
    });
    ticketCount++;
  }

  // 2 x REOPENED (disputed resolution, back with the same assignee)
  for (let i = 0; i < 2; i++) {
    const { categoryId, memberId } = randomTeamContext();
    const created = daysAgo(pick([4, 8]));
    await insertTicket({
      requester_id: pick(requesterIds),
      site_id: pick(siteIds),
      subject: pick(SUBJECTS),
      suggested_category_id: categoryId,
      confirmed_category_id: categoryId,
      suggested_priority: pick(PRIORITIES),
      confirmed_priority: pick(PRIORITIES),
      assigned_to: memberId,
      assigned_by: supportIds[0],
      assigned_at: created,
      status: 'reopened',
      created_at: created,
      resolved_at: daysAgo(pick([2, 3])),
    });
    ticketCount++;
  }

  console.log(`${ticketCount} tickets created across all 8 statuses.`);

  console.log('\n=== Seed complete ===');
  console.log(`Password for every seeded user: ${PASSWORD}`);
  console.log('Sample logins:');
  console.log('  requester1@example.com .. requester5@example.com');
  console.log('  manager1@example.com .. manager5@example.com (one per team, in TEAMS order)');
  console.log('  member1@example.com .. member20@example.com');
  console.log('  support1@example.com .. support5@example.com');
  console.log('  admin1@example.com .. admin5@example.com');
  console.log('  executive1@example.com .. executive5@example.com');
  console.log(`Teams (in order): ${TEAMS.join(', ')}`);

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
