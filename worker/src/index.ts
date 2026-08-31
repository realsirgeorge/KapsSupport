import 'dotenv/config';
import Queue from 'bull';
import { Pool } from 'pg';

const redis = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

const db = new Pool({
  host: process.env.DATABASE_HOST || 'postgres',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USER || 'support_app',
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME || 'support_ticketing',
});

// Define job queues
const leaveExpiryQueue = new Queue('leave-expiry', redis);
const attachmentValidationQueue = new Queue('attachment-validation', redis);
const notificationQueue = new Queue('notifications', redis);

// Leave expiry job - runs daily to expire old leave requests
leaveExpiryQueue.process(async (job) => {
  console.log('Processing leave expiry job');

  try {
    // Try to acquire an advisory lock to prevent concurrent runs
    const lockRes = await db.query('SELECT pg_advisory_lock(1)');

    // Find expired leave requests
    const result = await db.query(`
      UPDATE users
      SET is_unavailable = false
      WHERE is_unavailable = true
      AND id IN (
        SELECT user_id FROM availability_requests
        WHERE status = 'approved'
        AND type = 'range'
        AND end_date < CURRENT_DATE
      );
    `);

    console.log(`Updated ${result.rowCount} users for leave expiry`);

    // Release the lock
    await db.query('SELECT pg_advisory_unlock(1)');

    return { success: true, updated: result.rowCount };
  } catch (error) {
    console.error('Error processing leave expiry:', error);
    throw error;
  }
});

// Attachment validation job
attachmentValidationQueue.process(async (job) => {
  const { attachmentId } = job.data;

  console.log(`Validating attachment ${attachmentId}`);

  try {
    // In real implementation, this would:
    // 1. Fetch the file from MinIO
    // 2. Validate content-type by inspecting bytes
    // 3. Check file size
    // 4. Update status to 'safe' or 'rejected'

    // For now, just mark as safe
    await db.query(
      `UPDATE ticket_attachments
       SET status = 'safe', validated_at = now()
       WHERE id = $1`,
      [attachmentId],
    );

    console.log(`Attachment ${attachmentId} marked as safe`);
    return { success: true };
  } catch (error) {
    console.error('Error validating attachment:', error);
    await db.query(
      `UPDATE ticket_attachments
       SET status = 'rejected'
       WHERE id = $1`,
      [attachmentId],
    );
    throw error;
  }
});

// Notification job
notificationQueue.process(async (job) => {
  const { notificationId, userId, ticketId, subject, body } = job.data;

  console.log(`Sending notification ${notificationId} to user ${userId}`);

  try {
    // In real implementation, this would send an email via SMTP
    // For now, just log and mark as sent

    await db.query(
      `UPDATE notifications
       SET status = 'sent', sent_at = now()
       WHERE id = $1`,
      [notificationId],
    );

    console.log(`Notification ${notificationId} marked as sent`);
    return { success: true };
  } catch (error) {
    console.error('Error sending notification:', error);
    await db.query(
      `UPDATE notifications
       SET status = 'failed'
       WHERE id = $1`,
      [notificationId],
    );
    throw error;
  }
});

// Schedule leave expiry to run daily at 00:00 UTC
leaveExpiryQueue.add({}, { repeat: { cron: '0 0 * * *' } });

console.log('Worker started, listening for jobs...');

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await leaveExpiryQueue.close();
  await attachmentValidationQueue.close();
  await notificationQueue.close();
  await db.end();
  process.exit(0);
});
