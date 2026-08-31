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
  assigned_to?: string;
  site_id: string;
  confirmed_category_id?: string;
  confirmed_priority?: 'low' | 'medium' | 'high' | 'urgent';
  pending_reason?: string;
  pending_confirmation_days?: number;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  closed_at?: string;
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

// Ticket endpoints
export const ticketApi = {
  list: (params: ListTicketsParams) => apiClient.get('/tickets', { params }),
  get: (id: string) => apiClient.get(`/tickets/${id}`),
  create: (data: CreateTicketPayload) => apiClient.post('/tickets', data),
  updateStatus: (id: string, status: string, reason?: string) =>
    apiClient.patch(`/tickets/${id}/status`, { status, pending_reason: reason }),
  confirmResolution: (id: string, action: 'confirm' | 'dispute', comment?: string) =>
    apiClient.post(`/tickets/${id}/confirm-resolution`, { action, comment }),
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
