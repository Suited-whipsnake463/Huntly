import { useState } from 'react';
import { Mail, Eye, MousePointerClick, AlertTriangle, MessageSquare, BarChart3, TrendingUp, Send, FlaskConical, Clock } from 'lucide-react';
import { useStats, useCampaignAnalytics, useRecentEmails, type ABTestResult } from '../hooks/useLeads';
import { useCampaigns } from '../hooks/useCampaigns';

const funnelSteps = ['sent', 'delivered', 'opened', 'clicked', 'replied', 'converted'] as const;
const funnelColors: Record<string, string> = {
  sent: 'bg-cyan-500',
  delivered: 'bg-blue-500',
  opened: 'bg-violet-500',
  clicked: 'bg-amber-500',
  replied: 'bg-green-500',
  converted: 'bg-emerald-500',
};

export default function EmailsPage() {
  const { data: stats } = useStats();
  const { data: campaigns } = useCampaigns();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const { data: analytics } = useCampaignAnalytics(selectedCampaignId);

  const globalCards = [
    { label: 'Sent Today', value: stats?.sentToday ?? '-', icon: Mail, color: 'text-cyan-400' },
    { label: 'Opens', value: stats?.totalOpens ?? '-', icon: Eye, color: 'text-violet-400' },
    { label: 'Clicks', value: stats?.totalClicks ?? '-', icon: MousePointerClick, color: 'text-amber-400' },
    { label: 'Bounces', value: stats?.totalBounces ?? '-', icon: AlertTriangle, color: 'text-red-400' },
    { label: 'Replies', value: stats?.totalReplies ?? '-', icon: MessageSquare, color: 'text-green-400' },
  ];

  const rateCards = analytics
    ? [
        { label: 'Delivery Rate', value: `${analytics.rates.deliveryRate}%`, icon: Send, color: 'text-blue-400' },
        { label: 'Open Rate', value: `${analytics.rates.openRate}%`, icon: Eye, color: 'text-violet-400' },
        { label: 'Click Rate', value: `${analytics.rates.clickRate}%`, icon: MousePointerClick, color: 'text-amber-400' },
        { label: 'Reply Rate', value: `${analytics.rates.replyRate}%`, icon: MessageSquare, color: 'text-green-400' },
      ]
    : [];

  // Max value for funnel bar scaling
  const funnelMax = analytics ? Math.max(analytics.sent, 1) : 1;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Emails</h1>

      {/* Global stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {globalCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">{label}</p>
              <Icon size={18} className={color} />
            </div>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {/* Campaign selector */}
      {campaigns && campaigns.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <BarChart3 size={20} className="text-cyan-400" />
            Campaign Analytics
          </h2>
          <div className="flex flex-wrap gap-2">
            {campaigns.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCampaignId(selectedCampaignId === c.id ? null : c.id)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  selectedCampaignId === c.id
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                    : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent emails live feed */}
      {selectedCampaignId && <RecentEmailsFeed campaignId={selectedCampaignId} />}

      {/* Campaign analytics detail */}
      {selectedCampaignId && analytics && (
        <div className="space-y-5">
          {/* Rate cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rateCards.map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-400">{label}</p>
                  <Icon size={18} className={color} />
                </div>
                <p className="mt-2 text-3xl font-semibold">{value}</p>
              </div>
            ))}
          </div>

          {/* Funnel bar chart */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-cyan-400" />
              Email Funnel
            </h3>
            <div className="space-y-3">
              {funnelSteps.map((step) => {
                const value = analytics[step] ?? 0;
                const pct = funnelMax > 0 ? (value / funnelMax) * 100 : 0;
                return (
                  <div key={step} className="flex items-center gap-3">
                    <span className="w-24 text-xs text-gray-400 capitalize text-right">{step}</span>
                    <div className="flex-1 h-7 bg-gray-800 rounded-md overflow-hidden relative">
                      <div
                        className={`h-full ${funnelColors[step]} rounded-md transition-all duration-500`}
                        style={{ width: `${Math.max(pct, 0.5)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-3 text-xs font-medium text-white">
                        {value}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Absolute counts row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Total Emails" value={analytics.total} />
            <MiniStat label="Bounced" value={analytics.bounced} />
            <MiniStat label="Replied" value={analytics.replied} />
            <MiniStat label="Converted" value={analytics.converted} />
          </div>

          {/* A/B Test Results */}
          {analytics.abTest && analytics.abTest.length > 0 && (
            <ABTestSection abTest={analytics.abTest} />
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-xl font-semibold mt-0.5">{value}</p>
    </div>
  );
}

const emailStatusDot: Record<string, string> = {
  scheduled: 'bg-gray-400',
  sending: 'bg-yellow-400',
  delivered: 'bg-green-400',
  opened: 'bg-cyan-400',
  clicked: 'bg-emerald-400',
  bounced: 'bg-red-400',
  failed: 'bg-red-500',
  complained: 'bg-orange-400',
};

function RecentEmailsFeed({ campaignId }: { campaignId: string }) {
  const { data: emails } = useRecentEmails(campaignId);
  if (!emails || emails.length === 0) return null;

  // Show last 20
  const recent = emails.slice(0, 20);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
        <Clock size={16} className="text-cyan-400" />
        Recent Emails
        <span className="text-xs text-gray-500 font-normal ml-1">(auto-refreshing)</span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider">
              <th className="text-left pb-3 pr-4">Business</th>
              <th className="text-left pb-3 pr-4">To</th>
              <th className="text-left pb-3 pr-4">Subject</th>
              <th className="text-left pb-3 pr-4">Status</th>
              <th className="text-left pb-3 pr-4">Variant</th>
              <th className="text-right pb-3">Sent At</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((email) => (
              <tr key={email.id} className="border-t border-gray-800">
                <td className="py-2.5 pr-4 text-gray-300 truncate max-w-[160px]">{email.lead.businessName}</td>
                <td className="py-2.5 pr-4 text-gray-400 truncate max-w-[180px]">{email.lead.email}</td>
                <td className="py-2.5 pr-4 text-gray-400 truncate max-w-[220px]">{email.subject}</td>
                <td className="py-2.5 pr-4">
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${emailStatusDot[email.status] ?? 'bg-gray-500'}`} />
                    <span className="text-gray-300">{email.status}</span>
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-gray-400">{email.variant}</td>
                <td className="py-2.5 text-right text-gray-500 text-xs whitespace-nowrap">
                  {email.sentAt ? new Date(email.sentAt).toLocaleTimeString() : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ABTestSection({ abTest }: { abTest: ABTestResult[] }) {
  // Group by sequenceNumber so we can find the winner per email
  const sequences = [...new Set(abTest.map((r) => r.sequenceNumber))].sort();

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
        <FlaskConical size={16} className="text-cyan-400" />
        A/B Test Results
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider">
              <th className="text-left pb-3 pr-4">Email</th>
              <th className="text-left pb-3 pr-4">Variant</th>
              <th className="text-right pb-3 pr-4">Sent</th>
              <th className="text-right pb-3 pr-4">Open Rate</th>
              <th className="text-right pb-3 pr-4">Click Rate</th>
              <th className="text-right pb-3">Winner</th>
            </tr>
          </thead>
          <tbody>
            {sequences.map((seq) => {
              const rows = abTest.filter((r) => r.sequenceNumber === seq);
              const aRow = rows.find((r) => r.variant === 'A');
              const bRow = rows.find((r) => r.variant === 'B');

              // Determine winner by open rate, then click rate as tiebreaker
              let winner: string | null = null;
              if (aRow && bRow) {
                if (aRow.openRate > bRow.openRate) winner = 'A';
                else if (bRow.openRate > aRow.openRate) winner = 'B';
                else if (aRow.clickRate > bRow.clickRate) winner = 'A';
                else if (bRow.clickRate > aRow.clickRate) winner = 'B';
              }

              return rows.map((row) => {
                const isWinner = winner === row.variant;
                return (
                  <tr
                    key={`${seq}-${row.variant}`}
                    className={`border-t border-gray-800 ${isWinner ? 'bg-green-500/5' : ''}`}
                  >
                    <td className="py-2.5 pr-4 text-gray-300">Email {row.sequenceNumber}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`inline-flex items-center gap-1 ${isWinner ? 'text-green-400' : 'text-gray-400'}`}>
                        {row.variant} {row.variant === 'A' ? '(original)' : '(alternative)'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-gray-300">{row.sent}</td>
                    <td className={`py-2.5 pr-4 text-right ${isWinner ? 'text-green-400 font-semibold' : 'text-gray-300'}`}>
                      {row.openRate}%
                    </td>
                    <td className={`py-2.5 pr-4 text-right ${isWinner ? 'text-green-400 font-semibold' : 'text-gray-300'}`}>
                      {row.clickRate}%
                    </td>
                    <td className="py-2.5 text-right">
                      {isWinner && (
                        <span className="text-xs font-semibold text-green-400 bg-green-500/10 px-2 py-1 rounded-md">
                          Winner
                        </span>
                      )}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
