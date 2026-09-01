import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Client as MinioClient } from 'minio';
import Queue from 'bull';
import { randomUUID } from 'crypto';
import { TicketService, type User } from '../../tickets/services/ticket.service';

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
const ALLOWED_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
]);

export interface Attachment {
  id: string;
  ticket_id: string;
  uploaded_by: string;
  storage_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  status: 'pending' | 'safe' | 'rejected';
  validated_at?: Date;
  created_at: Date;
}

@Injectable()
export class AttachmentsService {
  private minio: MinioClient;
  private bucket: string;
  private validationQueue: Queue.Queue;

  constructor(
    private dataSource: DataSource,
    private ticketService: TicketService,
  ) {
    this.bucket = process.env.MINIO_BUCKET || 'ticket-attachments';
    this.minio = new MinioClient({
      endPoint: process.env.MINIO_HOST || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000', 10),
      useSSL: false,
      accessKey: process.env.MINIO_ROOT_USER || '',
      secretKey: process.env.MINIO_ROOT_PASSWORD || '',
    });
    this.validationQueue = new Queue('attachment-validation', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
      },
    });
  }

  /** Throws if the user can't see this ticket — same authorization TicketService already enforces. */
  private async assertTicketAccess(ticketId: string, user: User): Promise<void> {
    await this.ticketService.getTicket(ticketId, user);
  }

  /**
   * Step 1 of the 3-step upload flow: validate the proposed file, create a
   * 'pending' attachment row, and hand back a presigned PUT URL the client
   * uploads directly to MinIO with (the file never passes through the API).
   */
  async requestUpload(
    ticketId: string,
    user: User,
    data: { filename: string; content_type: string; size_bytes: number },
  ): Promise<{ attachment_id: string; upload_url: string }> {
    await this.assertTicketAccess(ticketId, user);

    if (!data.filename || !data.content_type || !data.size_bytes) {
      throw new BadRequestException('filename, content_type, and size_bytes are required');
    }
    if (data.size_bytes > MAX_SIZE_BYTES) {
      throw new BadRequestException(`File exceeds the ${MAX_SIZE_BYTES / 1024 / 1024}MB limit`);
    }
    if (!ALLOWED_CONTENT_TYPES.has(data.content_type)) {
      throw new BadRequestException(`Unsupported file type: ${data.content_type}`);
    }

    const storageKey = `tickets/${ticketId}/${randomUUID()}-${data.filename}`;

    const [attachment] = await this.dataSource.query(
      `INSERT INTO ticket_attachments
        (ticket_id, uploaded_by, storage_key, original_filename, content_type, size_bytes, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id`,
      [ticketId, user.id, storageKey, data.filename, data.content_type, data.size_bytes],
    );

    const uploadUrl = await this.minio.presignedPutObject(this.bucket, storageKey, 15 * 60);

    return { attachment_id: attachment.id, upload_url: uploadUrl };
  }

  /**
   * Step 2: client confirms the direct-to-MinIO upload finished. Enqueues
   * async validation (the worker's attachment-validation job flips
   * pending -> safe/rejected) rather than trusting the client's word for it.
   */
  async confirmUpload(ticketId: string, attachmentId: string, user: User): Promise<Attachment> {
    await this.assertTicketAccess(ticketId, user);

    const [attachment] = await this.dataSource.query(
      'SELECT * FROM ticket_attachments WHERE id = $1 AND ticket_id = $2',
      [attachmentId, ticketId],
    );
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    if (attachment.uploaded_by !== user.id && !user.is_admin) {
      throw new ForbiddenException('Only the uploader can confirm this attachment');
    }

    await this.validationQueue.add({ attachmentId });

    return attachment;
  }

  async listForTicket(ticketId: string, user: User): Promise<Attachment[]> {
    await this.assertTicketAccess(ticketId, user);

    return this.dataSource.query(
      `SELECT id, ticket_id, uploaded_by, original_filename, content_type, size_bytes, status, created_at
       FROM ticket_attachments
       WHERE ticket_id = $1 AND status != 'rejected'
       ORDER BY created_at DESC`,
      [ticketId],
    );
  }

  async getDownloadUrl(attachmentId: string, user: User): Promise<{ url: string; filename: string }> {
    const [attachment] = await this.dataSource.query('SELECT * FROM ticket_attachments WHERE id = $1', [
      attachmentId,
    ]);
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    await this.assertTicketAccess(attachment.ticket_id, user);

    if (attachment.status === 'rejected') {
      throw new ForbiddenException('This file failed validation and is not available for download');
    }

    const url = await this.minio.presignedGetObject(this.bucket, attachment.storage_key, 5 * 60);
    return { url, filename: attachment.original_filename };
  }
}
