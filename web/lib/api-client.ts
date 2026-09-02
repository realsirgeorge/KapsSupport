import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost/v1';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types
export interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  status: 'new' | 'assigned' | 'in_progress' | 'pending' | 'resolved' | 'pending_confirmation' | 'closed' | 'reopened';
  requester_id: string;
  requester_name?: string;
  assigned_to?: string;
  assignee_name?: string;
  site_id: string;
  site_name?: string;
  suggested_category_id?: string;
  confirmed_category_id?: string;
  category_name?: string;
  suggested_priority?: 'low' | 'medium' | 'high' | 'urgent';
  confirmed_priority?: 'low' | 'medium' | 'high' | 'urgent';
  pending_reason?: string;
  pending_confirmation_days?: number;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  closed_at?: string;
}

export interface Site {
  id: string;
  name: string;
  region?: string;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  team_id: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  team_id?: string;
  is_admin: boolean;
  is_support_triage: boolean;
  is_executive: boolean;
  is_unavailable: boolean;
  manages_team_id?: string;
}

export interface CreateTicketPayload {
  subject: string;
  description: string;
  site_id: string;
  suggested_category_id?: string;
  suggested_priority?: string;
}

export interface ListTicketsParams {
  status?: string;
  mine?: boolean;
  assigned_to_me?: boolean;
  team_id?: string;
  page?: number;
  limit?: number;
}

export interface Comment {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name?: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}

export interface Attachment {
  id: string;
  ticket_id: string;
  uploaded_by: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  status: 'pending' | 'safe' | 'rejected';
  created_at: string;
}

// Ticket endpoints
export const ticketApi = {
  list: (params: ListTicketsParams) => apiClient.get('/tickets', { params }),
  get: (id: string) => apiClient.get(`/tickets/${id}`),
  create: (data: CreateTicketPayload) => apiClient.post('/tickets', data),
  updateStatus: (id: string, status: string, reason?: string) =>
    apiClient.patch(`/tickets/${id}/status`, { status, pending_reason: reason }),
  confirmResolution: (id: string, action: 'confirm' | 'dispute', comment?: string) =>
    apiClient.post(`/tickets/${id}/confirm-resolution`, { action, comment }),
  recentActivity: (limit?: number) => apiClient.get('/tickets/activity', { params: limit ? { limit } : undefined }),
  history: (id: string) => apiClient.get(`/tickets/${id}/history`),
};

// Triage endpoints
export const triageApi = {
  queue: () => apiClient.get('/triage/queue'),
  confirmCategory: (ticketId: string, categoryId: string) =>
    apiClient.post(`/tickets/${ticketId}/category/confirm`, { category_id: categoryId }),
  confirmPriority: (ticketId: string, priority: string) =>
    apiClient.post(`/tickets/${ticketId}/priority/confirm`, { priority }),
  assign: (ticketId: string, assigneeId: string) =>
    apiClient.post(`/tickets/${ticketId}/assign`, { assignee_id: assigneeId }),
};

// Team endpoints
export const teamApi = {
  getWorkload: (teamId: string) => apiClient.get(`/teams/${teamId}/workload`),
  getStats: (teamId: string) => apiClient.get(`/teams/${teamId}/stats`),
  getTickets: (teamId: string, params?: any) =>
    apiClient.get(`/teams/${teamId}/tickets`, { params }),
  reassign: (ticketId: string, assigneeId: string) =>
    apiClient.post(`/tickets/${ticketId}/reassign`, { assignee_id: assigneeId }),
  returnToTriage: (ticketId: string, reason?: string) =>
    apiClient.post(`/tickets/${ticketId}/return-to-triage`, { reason }),
};

// Dashboard endpoints
export const dashboardApi = {
  system: () => apiClient.get('/dashboard/system'),
  pendingConfirmations: () => apiClient.get('/dashboard/system/pending-confirmations'),
  counters: () => apiClient.get('/me/counters'),
};

// Auth endpoints
export const authApi = {
  me: () => apiClient.get('/auth/me'),
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),
  logout: () => apiClient.post('/auth/logout'),
};

// Reference data (read-only lists used across forms/pickers)
export const sitesApi = {
  list: () => apiClient.get('/sites'),
};

export const categoriesApi = {
  list: () => apiClient.get('/categories'),
};

// Admin endpoints
export const adminApi = {
  teams: {
    list: () => apiClient.get('/teams'),
    create: (data: { name: string }) => apiClient.post('/teams', data),
    update: (id: string, data: Partial<{ name: string; manager_id: string }>) =>
      apiClient.patch(`/teams/${id}`, data),
    remove: (id: string) => apiClient.delete(`/teams/${id}`),
  },
  sites: {
    create: (data: { name: string; region?: string }) => apiClient.post('/sites', data),
    update: (id: string, data: Partial<{ name: string; region: string; active: boolean }>) =>
      apiClient.patch(`/sites/${id}`, data),
  },
  categories: {
    create: (data: { name: string; team_id: string }) => apiClient.post('/categories', data),
    update: (id: string, data: Partial<{ name: string; team_id: string }>) =>
      apiClient.patch(`/categories/${id}`, data),
  },
  users: {
    list: () => apiClient.get('/users'),
    updateRoles: (
      id: string,
      data: Partial<{ is_admin: boolean; is_support_triage: boolean; is_executive: boolean; team_id: string | null }>,
    ) =>
      apiClient.patch(`/users/${id}/roles`, data),
  },
  ticketSite: {
    correct: (ticketId: string, siteId: string) => apiClient.patch(`/tickets/${ticketId}/site`, { site_id: siteId }),
  },
};

// Comment endpoints
export const commentsApi = {
  list: (ticketId: string) => apiClient.get(`/tickets/${ticketId}/comments`),
  add: (ticketId: string, body: string, isInternal?: boolean) =>
    apiClient.post(`/tickets/${ticketId}/comments`, { body, is_internal: isInternal }),
};

// Availability endpoints
export const availabilityApi = {
  list: (status?: string) => apiClient.get('/availability-requests', { params: status ? { status } : undefined }),
  request: (data: { type: 'range' | 'toggle'; start_date?: string; end_date?: string }) =>
    apiClient.post('/availability-requests', data),
  approve: (id: string) => apiClient.post(`/availability-requests/${id}/approve`),
  reject: (id: string) => apiClient.post(`/availability-requests/${id}/reject`),
  end: (id: string) => apiClient.post(`/availability-requests/${id}/end`),
};

// Attachment endpoints
export const attachmentsApi = {
  list: (ticketId: string) => apiClient.get(`/tickets/${ticketId}/attachments`),
  requestUpload: (ticketId: string, data: { filename: string; content_type: string; size_bytes: number }) =>
    apiClient.post(`/tickets/${ticketId}/attachments/request-upload`, data),
  confirm: (ticketId: string, attachmentId: string) =>
    apiClient.post(`/tickets/${ticketId}/attachments/${attachmentId}/confirm`),
  getDownloadUrl: (attachmentId: string) => apiClient.get(`/attachments/${attachmentId}/download`),
};

/**
 * Full 3-step upload: request a presigned URL, PUT the file straight to
 * MinIO (never through our API), then confirm so the worker's validation
 * job picks it up. Throws on any step's failure — caller shows one error.
 */
export async function uploadAttachment(ticketId: string, file: File): Promise<void> {
  const { data } = await attachmentsApi.requestUpload(ticketId, {
    filename: file.name,
    content_type: file.type,
    size_bytes: file.size,
  });
  const { attachment_id, upload_url } = data.data;

  const putRes = await fetch(upload_url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!putRes.ok) {
    throw new Error(`Upload to storage failed (${putRes.status})`);
  }

  await attachmentsApi.confirm(ticketId, attachment_id);
}
