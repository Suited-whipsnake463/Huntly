import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, X, Star, Eye } from 'lucide-react';
import { useCampaign } from '../hooks/useCampaigns';
import { useLeads, useApproveLead, useSkipLead, useConvertLead, type LeadParams } from '../hooks/useLeads';

const statusColor: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  paused: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  completed: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  sourced: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  enriched: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  qualified: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  contacted: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  replied: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  converted: 'bg-green-500/10 text-green-400 border-green-500/20',
  skipped: 'bg-red-500/10 text-red-400 border-red-500/20',
  unsubscribed: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

const funnelStages = ['sourced', 'enriched', 'qualified', 'contacted', 'replied', 'converted'] as const;

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: campaign } = useCampaign(id!);
  const [filter, setFilter] = useState<LeadParams>({});
  const { data: leads } = useLeads(id!, filter);
  const approveMut = useApproveLead();
  const skipMut = useSkipLead();
  const convertMut = useConvertLead();

  if (!campaign) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/campaigns" className="text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{campaign.name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {campaign.vertical} - {campaign.regions.join(', ')}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${statusColor[campaign.status] ?? statusColor.draft}`}
        >
          {campaign.status}
        </span>
      </div>

      {/* Funnel filter buttons */}
      {campaign.stats && (() => {
        const stats = campaign.stats;
        return (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter({})}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                !filter.status
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                  : 'border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              All
            </button>
            {funnelStages.map((stage) => (
              <button
                key={stage}
                onClick={() => setFilter({ status: stage })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter.status === stage
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                    : 'border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {stage.charAt(0).toUpperCase() + stage.slice(1)}{' '}
                <span className="text-gray-500">
                  ({stats[stage] ?? 0})
                </span>
              </button>
            ))}
          </div>
        );
      })()}

      {/* Leads table */}
      <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-400 uppercase tracking-wider">
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Signals</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {leads && leads.length > 0 ? (
              leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 font-medium">{lead.businessName}</td>
                  <td className={`px-4 py-3 font-mono font-semibold ${scoreColor(lead.score)}`}>
                    {lead.score}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{lead.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusColor[lead.status] ?? statusColor.sourced}`}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {lead.signals?.hasWhatsapp && (
                        <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
                          WA
                        </span>
                      )}
                      {lead.signals?.hasBot && (
                        <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">
                          Bot
                        </span>
                      )}
                      {lead.signals?.hasBooking && (
                        <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400">
                          Book
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => approveMut.mutate(lead.id)}
                        title="Approve"
                        className="rounded-md p-1.5 text-green-400 hover:bg-green-500/10 transition-colors"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => skipMut.mutate(lead.id)}
                        title="Skip"
                        className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={() => convertMut.mutate(lead.id)}
                        title="Convert"
                        className="rounded-md p-1.5 text-amber-400 hover:bg-amber-500/10 transition-colors"
                      >
                        <Star size={14} />
                      </button>
                      <Link
                        to={`/leads/${lead.id}`}
                        title="View"
                        className="rounded-md p-1.5 text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                      >
                        <Eye size={14} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {leads ? 'No leads match the current filter.' : 'Loading...'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
