import { Link } from 'react-router-dom';
import { useFunnel } from '../hooks/useLeads';
import { useCampaigns } from '../hooks/useCampaigns';

const funnelStages = [
  { key: 'sourced', label: 'Sourced', color: 'bg-gray-500' },
  { key: 'enriched', label: 'Enriched', color: 'bg-violet-500' },
  { key: 'qualified', label: 'Qualified', color: 'bg-blue-500' },
  { key: 'contacted', label: 'Contacted', color: 'bg-cyan-500' },
  { key: 'replied', label: 'Replied', color: 'bg-amber-500' },
  { key: 'converted', label: 'Converted', color: 'bg-green-500' },
] as const;

export default function LeadsPage() {
  const { data: funnel } = useFunnel();
  const { data: campaigns } = useCampaigns();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Leads</h1>

      {/* Global funnel overview */}
      {funnel && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {funnelStages.map(({ key, label, color }) => (
            <div
              key={key}
              className="rounded-xl border border-gray-800 bg-gray-900 p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`h-2 w-2 rounded-full ${color}`} />
                <p className="text-xs text-gray-400">{label}</p>
              </div>
              <p className="text-2xl font-semibold">
                {funnel[key as keyof typeof funnel]}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Browse by campaign */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-lg font-medium mb-4">Browse by Campaign</h2>
        {campaigns && campaigns.length > 0 ? (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <Link
                key={c.id}
                to={`/campaigns/${c.id}`}
                className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-4 py-3 hover:border-gray-700 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {c.vertical} - {c.regions.join(', ')}
                  </p>
                </div>
                <span className="text-sm text-cyan-400">View leads</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No campaigns yet.</p>
        )}
      </div>
    </div>
  );
}
