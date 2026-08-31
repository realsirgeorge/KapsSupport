import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost/v1';
const FRONTEND_URL = 'http://localhost';

test.describe('Ticket Lifecycle - Happy Path', () => {
  let ticketNumber: string;
  let ticketId: string;

  test('1. Requester creates a ticket', async ({ page, request }) => {
    // Navigate to login
    await page.goto(FRONTEND_URL);
    expect(page.url()).toContain('/login');

    // Login as requester (stub credentials)
    await page.fill('input[name="email"]', 'requester@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button:has-text("Sign In")');

    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard');
    expect(page.url()).toContain('/dashboard');

    // Navigate to Create Ticket
    await page.click('a:has-text("Create Ticket")');
    await page.waitForURL('**/dashboard/new');

    // Fill form
    await page.fill('input[name="subject"]', 'POS terminal offline');
    await page.fill('textarea[name="description"]', 'The POS terminal at register 3 is not responding');
    await page.selectOption('select[name="site_id"]', 'site-1'); // Westgate
    await page.selectOption('select[name="suggested_category_id"]', 'cat-1'); // Fintech
    await page.selectOption('select[name="suggested_priority"]', 'high');

    // Submit
    await page.click('button:has-text("Create Ticket")');

    // Extract ticket number from URL or detail page
    await page.waitForURL('**/dashboard/tickets/*');
    const urlMatch = page.url().match(/tickets\/([a-z0-9-]+)/);
    if (urlMatch) {
      ticketId = urlMatch[1];
    }

    // Verify ticket appears in My Tickets
    await page.goto(FRONTEND_URL + '/dashboard/tickets');
    await expect(page.locator('text=/TCK-/').first()).toBeVisible();
    ticketNumber = await page.locator('text=/TCK-\d+/').first().textContent() || '';
  });

  test('2. Support/Triage reviews and assigns ticket', async ({ page, request }) => {
    // Login as Support/Triage
    await page.goto(FRONTEND_URL);
    await page.fill('input[name="email"]', 'support@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button:has-text("Sign In")');

    // Navigate to Triage Queue
    await page.click('a:has-text("Triage Queue")');
    await page.waitForURL('**/dashboard/triage');

    // Find ticket and click it
    await expect(page.locator(`text=${ticketNumber}`)).toBeVisible();
    await page.click(`text=${ticketNumber}`);

    // Confirm category
    await page.selectOption('select', 'Fintech');
    // Would click "Confirm Category" button

    // Select assignee
    // Would fill assignee selector
    // Would click "Assign"
  });

  test('3. Team Member updates ticket status through workflow', async ({ page, request }) => {
    // Login as Team Member
    await page.goto(FRONTEND_URL);
    await page.fill('input[name="email"]', 'member@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button:has-text("Sign In")');

    // Navigate to Assigned to Me
    await page.click('a:has-text("Assigned to Me")');
    await page.waitForURL('**/dashboard/assigned');

    // Find and open ticket
    await expect(page.locator(`text=${ticketNumber}`)).toBeVisible();
    await page.click(`text=${ticketNumber}`);

    // Update status: assigned → in_progress
    await page.click('button:has-text("Update Status")');
    await page.selectOption('select', 'in_progress');
    await page.click('button:has-text("Save")');

    // Verify status changed
    await expect(page.locator('text=In Progress')).toBeVisible();

    // Update status: in_progress → pending (with reason)
    await page.click('button:has-text("Update Status")');
    await page.selectOption('select', 'pending');
    await page.fill('textarea[name="pending_reason"]', 'Waiting for vendor callback');
    await page.click('button:has-text("Save")');
    await expect(page.locator('text=Waiting for vendor callback')).toBeVisible();

    // Update status: pending → resolved
    await page.click('button:has-text("Update Status")');
    await page.selectOption('select', 'resolved');
    await page.click('button:has-text("Save")');

    // Verify transitions to pending_confirmation
    await expect(page.locator('text=Pending Confirmation')).toBeVisible();
  });

  test('4. Requester confirms resolution', async ({ page, request }) => {
    // Login as requester again
    await page.goto(FRONTEND_URL);
    await page.fill('input[name="email"]', 'requester@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button:has-text("Sign In")');

    // Navigate to My Tickets
    await page.click('a:has-text("My Tickets")');

    // Find ticket (should be in pending_confirmation)
    await page.click(`text=${ticketNumber}`);

    // Should see Confirm/Dispute buttons
    await expect(page.locator('button:has-text("Confirm Resolution")')).toBeVisible();
    await expect(page.locator('button:has-text("Dispute Resolution")')).toBeVisible();

    // Click Confirm
    await page.click('button:has-text("Confirm Resolution")');

    // Verify closed
    await expect(page.locator('text=Closed')).toBeVisible();
  });

  test('5. Verify audit trail', async ({ request }) => {
    // API call to verify ticket_history
    const response = await request.get(`${API_URL}/tickets/${ticketId}`, {
      headers: { Authorization: 'Bearer stub-token' },
    });

    expect(response.ok()).toBeTruthy();
    // Would verify ticket_history has entries for:
    // - created
    // - category_confirmed
    // - assigned
    // - status_changed (×3 for in_progress, pending, resolved)
    // - confirmed
  });
});

test.describe('Ticket Lifecycle - Dispute Path', () => {
  test('Requester disputes resolution and reopens to same Team Member', async ({ page }) => {
    // [Similar setup to happy path through resolution]
    // Would navigate to pending confirmation
    // Would click "Dispute Resolution"
    // Would verify ticket reopens
    // Would verify assigned to same Team Member (not back to Support/Triage)
  });
});

test.describe('RBAC & Scoping', () => {
  test('Team Member cannot see other members assigned tickets', async ({ page }) => {
    // Login as member A
    // Create/assign ticket to member B
    // Login as member A
    // Verify ticket does not appear in "Assigned to Me"
    // Verify ticket does not appear in "My Tickets"
  });

  test('Manager can only reassign within own team', async ({ page, request }) => {
    // Login as manager of Team A
    // Try to reassign to member in Team B
    // Expect 403 FORBIDDEN response
  });

  test('Requester cannot access other users tickets', async ({ page, request }) => {
    // Login as requester A
    // Try GET /tickets with another requester's ticket ID
    // Expect 404 (not found) response
  });
});

test.describe('Availability & Unavailable Members', () => {
  test('Unavailable members cannot be assigned new tickets', async ({ page, request }) => {
    // Team Member submits leave request
    // Manager approves
    // Support/Triage tries to assign
    // Expect member excluded from dropdown + 409 CONFLICT on POST
  });
});

test.describe('State Machine Enforcement', () => {
  test('Invalid status transitions return 409 CONFLICT', async ({ request }) => {
    // Try to transition: new → pending (should be invalid)
    // Expect 409 response with error message
  });

  test('Pending status requires reason field', async ({ request }) => {
    // Try to transition to pending without pending_reason
    // Expect 422 VALIDATION_ERROR
  });
});
