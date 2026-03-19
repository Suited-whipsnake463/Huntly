import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Campaign {
  id: string;
  name: string;
  vertical: string;
  regions: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
  stats?: {
    sourced: number;
    enriched: number;
    qualified: number;
    contacted: number;
    replied: number;
    converted: number;
  };
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<Campaign[]>('/campaigns'),
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ['campaigns', id],
    queryFn: () => api.get<Campaign>(`/campaigns/${id}`),
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; vertical: string; regions: string[] }) =>
      api.post<Campaign>('/campaigns', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useLaunchCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Campaign>(`/campaigns/${id}/launch`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}
