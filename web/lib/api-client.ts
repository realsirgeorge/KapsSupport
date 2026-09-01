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
    updateRoles: (id: string, data: Partial<{ is_admin: boolean; is_support_triage: boolean; is_executive: boolean }>) =>
      apiClient.patch(`/users/${id}/roles`, data),
  },
  ticketSite: {
    correct: (ticketId: string, siteId: string) => apiClient.patch(`/tickets/${ticketId}/site`, { site_id: siteId }),
  },
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
