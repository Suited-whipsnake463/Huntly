import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Lead {
  id: string;
  campaignId: string;
  businessName: string;
  email: string;
  phone?: string;
  website?: string;
  score: number;
  status: string;
  signals?: {
    hasWhatsapp?: boolean;
    hasBot?: boolean;
    hasBooking?: boolean;
  };
  enrichment?: Record<string, unknown>;
  qualification?: Record<string, unknown>;
  emails?: Array<{ subject: string; sentAt: string; openedAt?: string; clickedAt?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface LeadParams {
  status?: string;
  minScore?: number;
  maxScore?: number;
  limit?: number;
  offset?: number;
}

export interface FunnelStats {
  sourced: number;
  enriched: number;
  qualified: number;
  contacted: number;
  replied: number;
  converted: number;
}

export interface EmailStats {
  sentToday: number;
  totalOpens: number;
  totalClicks: number;
  totalBounces: number;
  totalReplies: number;
}

function buildQuery(params?: LeadParams): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  if (params.status) sp.set('status', params.status);
  if (params.minScore != null) sp.set('minScore', String(params.minScore));
  if (params.maxScore != null) sp.set('maxScore', String(params.maxScore));
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.offset != null) sp.set('offset', String(params.offset));
  const q = sp.toString();
  return q ? `?${q}` : '';
}

export function useLeads(campaignId: string, params?: LeadParams) {
  return useQuery({
    queryKey: ['leads', campaignId, params],
    queryFn: () => api.get<Lead[]>(`/campaigns/${campaignId}/leads${buildQuery(params)}`),
    enabled: !!campaignId,
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => api.get<Lead>(`/leads/${id}`),
    enabled: !!id,
  });
}

export function useFunnel() {
  return useQuery({
    queryKey: ['funnel'],
    queryFn: () => api.get<FunnelStats>('/funnel'),
  });
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<EmailStats>('/stats'),
  });
}

export function useApproveLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/leads/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['funnel'] });
    },
  });
}

export function useSkipLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/leads/${id}/skip`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['funnel'] });
    },
  });
}

export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/leads/${id}/convert`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['funnel'] });
    },
  });
}

export function usePauseDrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/leads/${id}/pause-drip`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
