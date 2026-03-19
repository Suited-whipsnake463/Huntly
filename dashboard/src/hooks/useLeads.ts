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

export function usePipeline() {
  return useQuery({
    queryKey: ['pipeline'],
    queryFn: () => api.get<any>('/pipeline'),
    refetchInterval: 5000, // auto-refresh every 5s
  });
}

export interface CampaignAnalytics {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  replied: number;
  converted: number;
  rates: {
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    bounceRate: number;
    replyRate: number;
    conversionRate: number;
  };
}

export function useCampaignAnalytics(campaignId: string | null) {
  return useQuery({
    queryKey: ['campaign-analytics', campaignId],
    queryFn: () => api.get<CampaignAnalytics>(`/campaigns/${campaignId}/analytics`),
    enabled: !!campaignId,
  });
}

export function useEmailPreview(leadId: string | null) {
  return useQuery({
    queryKey: ['preview', leadId],
    queryFn: () => api.get<any>(`/leads/${leadId}/preview`),
    enabled: !!leadId,
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
