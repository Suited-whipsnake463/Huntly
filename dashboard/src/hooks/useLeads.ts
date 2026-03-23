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
  search?: string;
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
  if (params.search) sp.set('search', params.search);
  const q = sp.toString();
  return q ? `?${q}` : '';
}

export interface AppConfig {
  emailEnabled: boolean;
  aiProvider: string;
  ollamaModel?: string;
}

export function useAppConfig() {
  return useQuery({
    queryKey: ['app-config'],
    queryFn: () => api.get<AppConfig>('/config'),
    staleTime: 60_000,
  });
}

export interface OllamaModel {
  name: string;
  sizeGB: number;
  modified: string;
}

export interface AiModelsResponse {
  ollamaOnline: boolean;
  models: OllamaModel[];
}

export function useAiModels() {
  return useQuery({
    queryKey: ['ai-models'],
    queryFn: () => api.get<AiModelsResponse>('/ai/models'),
    staleTime: 30_000,
  });
}

export function useSetAiProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { provider: string; ollamaModel?: string }) =>
      api.post('/ai/provider', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-config'] });
    },
  });
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
    refetchInterval: 3000,
  });
}

export interface RecentEmail {
  id: string;
  sequenceNumber: number;
  subject: string;
  status: string;
  variant: string;
  sentAt: string | null;
  createdAt: string;
  resendMessageId: string | null;
  lead: { id: string; businessName: string; email: string };
}

export function useRecentEmails(campaignId: string | null) {
  return useQuery({
    queryKey: ['recent-emails', campaignId],
    queryFn: () => api.get<RecentEmail[]>(`/campaigns/${campaignId}/emails`),
    enabled: !!campaignId,
    refetchInterval: 3000,
  });
}

export function useApproveLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sendNow = false }: { id: string; sendNow?: boolean }) =>
      api.post(`/leads/${id}/approve${sendNow ? '?sendNow=true' : ''}`),
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

export interface ABTestResult {
  variant: string;
  sequenceNumber: number;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
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
  abTest?: ABTestResult[];
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

export interface ScoringRange {
  range: string;
  total: number;
  contacted: number;
  replied: number;
  converted: number;
  replyRate: number;
  conversionRate: number;
}

export interface ScoringInsights {
  ranges: ScoringRange[];
}

export function useScoringInsights() {
  return useQuery({
    queryKey: ['scoring-insights'],
    queryFn: () => api.get<ScoringInsights>('/scoring-insights'),
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
