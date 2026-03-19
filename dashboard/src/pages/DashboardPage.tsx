import { Link } from 'react-router-dom';
import { Users, Mail, MousePointerClick, MessageSquare } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useFunnel, useStats, type FunnelStats } from '../hooks/useLeads';
import { useCampaigns } from '../hooks/useCampaigns';

const statusColor: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  paused: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  completed: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
};

const FUNNEL_COLORS = ['#6b7280', '#8b5cf6', '#3b82f6', '#22d3ee', '#f59e0b', '#22c55e'];

function funnelData(f: FunnelStats) {
  return [
    { name: 'Sourced', value: f.sourced },
    { name: 'Enriched', value: f.enriched },
    { name: 'Qualified', value: f.qualified },
    { name: 'Contacted', value: f.contacted },
    { name: 'Replied', value: f.replied },
    { name: 'Converted', value: f.converted },
  ];
}

export default function DashboardPage() {
  const { data: funnel } = useFunnel();
  const { data: stats } = useStats();
  const { data: campaigns } = useCampaigns();

  const statCards = [
    { label: 'Total Leads', value: funnel?.sourced ?? '-', icon: Users, color: 'text-cyan-400' },
    { label: 'Emails Sent Today', value: stats?.sentToday ?? '-', icon: Mail, color: 'text-violet-400' },
    { label: 'Clicks', value: stats?.totalClicks ?? '-', icon: MousePointerClick, color: 'text-amber-400' },
    { label: 'Replies', value: stats?.totalReplies ?? '-', icon: MessageSquare, color: 'text-green-400' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">{label}</p>
              <Icon size={18} className={color} />
            </div>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {/* Funnel chart */}
      {funnel && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-4 text-lg font-medium">Lead Funnel</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnelData(funnel)} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fill: '#d1d5db', fontSize: 13 }}
                width={90}
              />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#d1d5db' }}
                itemStyle={{ color: '#e5e7eb' }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                {funnelData(funnel).map((_, i) => (
                  <Cell key={i} fill={FUNNEL_COLORS[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Active campaigns */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Active Campaigns</h2>
          <Link
            to="/campaigns"
            className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            View all
          </Link>
        </div>
        {campaigns && campaigns.length > 0 ? (
          <div className="space-y-2">
            {campaigns.slice(0, 5).map((c) => (
              <Link
                key={c.id}
                to={`/campaigns/${c.id}`}
                className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-4 py-3 hover:border-gray-700 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.vertical} - {c.regions.join(', ')}</p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor[c.status] ?? statusColor.draft}`}
                >
                  {c.status}
                </span>
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
