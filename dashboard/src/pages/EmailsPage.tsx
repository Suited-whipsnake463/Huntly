import { Mail, Eye, MousePointerClick, AlertTriangle, MessageSquare } from 'lucide-react';
import { useStats } from '../hooks/useLeads';

export default function EmailsPage() {
  const { data: stats } = useStats();

  const cards = [
    { label: 'Sent Today', value: stats?.sentToday ?? '-', icon: Mail, color: 'text-cyan-400' },
    { label: 'Opens', value: stats?.totalOpens ?? '-', icon: Eye, color: 'text-violet-400' },
    { label: 'Clicks', value: stats?.totalClicks ?? '-', icon: MousePointerClick, color: 'text-amber-400' },
    { label: 'Bounces', value: stats?.totalBounces ?? '-', icon: AlertTriangle, color: 'text-red-400' },
    { label: 'Replies', value: stats?.totalReplies ?? '-', icon: MessageSquare, color: 'text-green-400' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Emails</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">{label}</p>
              <Icon size={18} className={color} />
            </div>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
