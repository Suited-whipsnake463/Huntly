import { Link } from 'react-router-dom';
import { Users, Mail, MousePointerClick, MessageSquare, Loader2, CheckCircle2, AlertCircle, Clock, Zap, Globe, MailCheck } from 'lucide-react';
import { useFunnel, useStats, usePipeline } from '../hooks/useLeads';
import { useCampaigns } from '../hooks/useCampaigns';

const FUNNEL_STEPS = [
  { key: 'sourced', label: 'Sourced', color: '#6B7280' },
  { key: 'enriched', label: 'Enriched', color: '#8B5CF6' },
  { key: 'qualified', label: 'Qualified', color: '#6366F1' },
  { key: 'contacted', label: 'Contacted', color: '#22D3EE' },
  { key: 'replied', label: 'Replied', color: '#F59E0B' },
  { key: 'converted', label: 'Converted', color: '#22C55E' },
];

const QUEUE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  source: { label: 'Source (Outscraper)', icon: <Globe size={14} /> },
  enrich: { label: 'Enrich (Crawl + AI)', icon: <Zap size={14} /> },
  qualify: { label: 'Qualify (AI Score)', icon: <CheckCircle2 size={14} /> },
  outreach: { label: 'Outreach (Email)', icon: <MailCheck size={14} /> },
};

export default function DashboardPage() {
  const { data: funnel, isLoading: funnelLoading } = useFunnel();
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: campaigns } = useCampaigns();
  const { data: pipeline } = usePipeline();

  const totalLeads = funnel ? Object.values(funnel).reduce((a: number, b: number) => a + b, 0) : 0;
  const maxCount = funnel ? Math.max(...Object.values(funnel).map(Number), 1) : 1;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Users size={16} />} label="Total Leads" value={totalLeads} loading={funnelLoading} />
        <StatCard icon={<Mail size={16} />} label="Emails Sent Today" value={stats?.sentToday ?? 0} loading={statsLoading} />
        <StatCard icon={<MousePointerClick size={16} />} label="Total Clicks" value={stats?.totalClicks ?? 0} loading={statsLoading} />
        <StatCard icon={<MessageSquare size={16} />} label="Replies" value={funnel?.replied ?? 0} loading={funnelLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Status — Live */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Pipeline Status</h2>
            <span className="text-[10px] text-gray-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> Live — refreshes every 5s
            </span>
          </div>

          {pipeline?.queues ? (
            <div className="space-y-3">
              {Object.entries(pipeline.queues).map(([name, counts]: [string, any]) => {
                const q = QUEUE_LABELS[name];
                const isActive = counts.active > 0 || counts.waiting > 0;
                const total = counts.active + counts.waiting + counts.completed + counts.failed;
                const progress = total > 0 ? ((counts.completed / total) * 100) : 0;

                return (
                  <div key={name} className="bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400">{q?.icon}</span>
                        <span className="font-medium">{q?.label ?? name}</span>
                        {isActive && (
                          <Loader2 size={12} className="text-cyan-400 animate-spin" />
                        )}
                        {!isActive && counts.completed > 0 && (
                          <CheckCircle2 size={12} className="text-green-400" />
                        )}
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs">
                      {counts.active > 0 && (
                        <span className="text-cyan-400 flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" /> {counts.active} active
                        </span>
                      )}
                      {counts.waiting > 0 && (
                        <span className="text-yellow-400 flex items-center gap-1">
                          <Clock size={10} /> {counts.waiting} waiting
                        </span>
                      )}
                      <span className="text-green-400">{counts.completed} done</span>
                      {counts.failed > 0 && (
                        <span className="text-red-400 flex items-center gap-1">
                          <AlertCircle size={10} /> {counts.failed} failed
                        </span>
                      )}
                      {counts.delayed > 0 && (
                        <span className="text-gray-400">{counts.delayed} scheduled</span>
                      )}
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Loading pipeline status...</p>
          )}

          {/* Lead Stats Breakdown */}
          {pipeline?.leadStats && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">Lead Breakdown</p>
              <div className="space-y-1">
                {pipeline.leadStats.map((s: any) => (
                  <div key={s.status} className="flex items-center text-xs gap-2">
                    <span className="w-20 text-gray-400 capitalize">{s.status}</span>
                    <span className="font-mono text-gray-200 w-10 text-right">{s.count}</span>
                    <span className="text-gray-500">
                      ({s.withEmail} with email, {s.withWebsite} with website)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Funnel */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Lead Funnel</h2>
          <div className="space-y-3">
            {FUNNEL_STEPS.map(({ key, label, color }) => {
              const count = (funnel as any)?.[key] ?? 0;
              const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-gray-400">{label}</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <span className="w-16 text-sm text-right font-mono">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Activity + Errors side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {pipeline?.recentActivity?.map((lead: any) => (
              <div key={lead.id} className="flex items-center gap-3 text-xs py-1.5 px-2 bg-gray-800/30 rounded-md">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  lead.status === 'qualified' ? 'bg-indigo-400' :
                  lead.status === 'enriched' ? 'bg-violet-400' :
                  lead.status === 'contacted' ? 'bg-cyan-400' :
                  lead.status === 'converted' ? 'bg-green-400' :
                  'bg-gray-500'
                }`} />
                <span className="text-gray-300 truncate flex-1">{lead.businessName}</span>
                <span className="text-gray-500 capitalize">{lead.status}</span>
                {lead.qualification?.fitScore != null && (
                  <span className={`font-mono font-bold ${
                    lead.qualification.fitScore >= 70 ? 'text-green-400' :
                    lead.qualification.fitScore >= 40 ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>{lead.qualification.fitScore}</span>
                )}
                {lead.email && <span className="text-green-400">&#9993;</span>}
                <span className="text-gray-600">{new Date(lead.updatedAt).toLocaleTimeString()}</span>
              </div>
            )) ?? <p className="text-gray-500 text-sm">No activity yet.</p>}
          </div>
        </div>

        {/* Errors */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">
            Errors
            {pipeline?.recentErrors?.length > 0 && (
              <span className="text-red-400 text-sm font-normal ml-2">({pipeline.recentErrors.length})</span>
            )}
          </h2>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {pipeline?.recentErrors?.length > 0 ? pipeline.recentErrors.map((e: any) => (
              <div key={e.id} className="text-xs bg-red-500/5 border border-red-500/10 rounded-md px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-300 font-medium">{e.businessName}</span>
                  <span className="text-gray-600">{new Date(e.updatedAt).toLocaleTimeString()}</span>
                </div>
                <p className="text-red-300/80 truncate">{e.lastError}</p>
              </div>
            )) : (
              <p className="text-gray-500 text-sm">No errors. Everything running smoothly.</p>
            )}
          </div>
        </div>
      </div>

      {/* Campaigns */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Campaigns</h2>
        {!campaigns?.length ? <p className="text-gray-500 text-sm">No campaigns yet.</p> : (
          <div className="space-y-2">
            {campaigns.map((c: any) => (
              <Link key={c.id} to={`/campaigns/${c.id}`} className="flex items-center justify-between py-3 px-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition">
                <div>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-gray-500 text-sm ml-3">{c.vertical}</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  c.status === 'active' ? 'bg-green-500/20 text-green-400' :
                  c.status === 'draft' ? 'bg-gray-600/20 text-gray-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>{c.status}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: number; loading: boolean }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">{icon} {label}</div>
      <div className="text-2xl font-bold">{loading ? <span className="text-gray-600">—</span> : value.toLocaleString()}</div>
    </div>
  );
}
