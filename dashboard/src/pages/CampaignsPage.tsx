import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Rocket } from 'lucide-react';
import { useCampaigns, useCreateCampaign, useLaunchCampaign } from '../hooks/useCampaigns';

const statusColor: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  paused: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  completed: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
};

export default function CampaignsPage() {
  const { data: campaigns, isLoading } = useCampaigns();
  const createMutation = useCreateCampaign();
  const launchMutation = useLaunchCampaign();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [vertical, setVertical] = useState('');
  const [regions, setRegions] = useState('');

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate(
      { name, vertical, regions: regions.split(',').map((r) => r.trim()).filter(Boolean) },
      {
        onSuccess: () => {
          setShowForm(false);
          setName('');
          setVertical('');
          setRegions('');
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-cyan-400 transition-colors"
        >
          <Plus size={16} />
          New Campaign
        </button>
      </div>

      {/* Inline create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Q1 Dental Clinics"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Vertical</label>
              <input
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                placeholder="dental clinic"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                required
              />
              <p className="text-[10px] text-gray-500 mt-1">Use Google Maps search terms: "dental clinic", "law firm", "real estate agent", "hair salon", "veterinary clinic"</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Regions (comma-separated)</label>
              <input
                value={regions}
                onChange={(e) => setRegions(e.target.value)}
                placeholder="London UK, Dubai UAE, São Paulo Brazil"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                required
              />
              <p className="text-[10px] text-gray-500 mt-1">Use "City Country" format for best results: "Miami US", "London UK", "Dubai UAE", "São Paulo Brazil"</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Campaign list */}
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : campaigns && campaigns.length > 0 ? (
        <div className="space-y-2">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-5 py-4"
            >
              <Link to={`/campaigns/${c.id}`} className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {c.vertical} - {c.regions.join(', ')}
                </p>
              </Link>
              <div className="flex items-center gap-3 ml-4">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor[c.status] ?? statusColor.draft}`}
                >
                  {c.status}
                </span>
                {c.status === 'draft' && (
                  <button
                    onClick={() => launchMutation.mutate(c.id)}
                    disabled={launchMutation.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
                  >
                    <Rocket size={14} />
                    Launch
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No campaigns yet. Create one to get started.</p>
      )}
    </div>
  );
}
