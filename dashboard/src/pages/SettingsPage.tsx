import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, Shield, Key, Eye, EyeOff, Brain, Cpu, Cloud, Zap, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAppConfig, useAiModels, useSetAiProvider } from '../hooks/useLeads';

interface ExcludedClient {
  id: string;
  phone: string | null;
  domain: string | null;
  reason: string;
  createdAt: string;
}

function useBlacklist() {
  return useQuery({
    queryKey: ['blacklist'],
    queryFn: () => api.get<ExcludedClient[]>('/blacklist'),
  });
}

function useAddBlacklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { phone?: string; domain?: string; reason: string }) =>
      api.post<ExcludedClient>('/blacklist', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blacklist'] }),
  });
}

function useRemoveBlacklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/blacklist/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blacklist'] }),
  });
}

const PROVIDERS = [
  { id: 'ollama', label: 'Ollama (Local)', icon: Cpu, desc: 'Free, runs on your machine', color: 'text-green-400' },
  { id: 'groq', label: 'Groq (Cloud)', icon: Zap, desc: 'Fast, free tier available', color: 'text-violet-400' },
  { id: 'openai', label: 'OpenAI (Cloud)', icon: Cloud, desc: 'GPT-4.1-mini, paid', color: 'text-cyan-400' },
] as const;

export default function SettingsPage() {
  const { data: blacklist, isLoading } = useBlacklist();
  const addMutation = useAddBlacklist();
  const removeMutation = useRemoveBlacklist();

  const { data: appConfig } = useAppConfig();
  const { data: aiModels } = useAiModels();
  const setProviderMut = useSetAiProvider();

  const [type, setType] = useState<'domain' | 'phone'>('domain');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [showKey, setShowKey] = useState(false);

  const apiKey = localStorage.getItem('huntly_api_key') || '';
  const maskedKey = apiKey ? apiKey.slice(0, 6) + '...' + apiKey.slice(-4) : 'Not set';

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;

    const data: { phone?: string; domain?: string; reason: string } = {
      reason: reason.trim() || 'Manually blacklisted',
    };
    if (type === 'domain') {
      data.domain = value.trim();
    } else {
      data.phone = value.trim();
    }

    addMutation.mutate(data, {
      onSuccess: () => {
        setValue('');
        setReason('');
      },
    });
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* API Key */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Key size={18} className="text-cyan-400" />
          <h2 className="text-lg font-semibold">API Key</h2>
        </div>
        <div className="flex items-center gap-3">
          <code className="flex-1 rounded-lg bg-gray-800 px-4 py-2.5 text-sm text-gray-300 font-mono">
            {showKey ? apiKey : maskedKey}
          </code>
          <button
            onClick={() => setShowKey(!showKey)}
            className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
            title={showKey ? 'Hide' : 'Show'}
          >
            {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </section>

      {/* AI Provider */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-violet-400" />
          <h2 className="text-lg font-semibold">AI Provider</h2>
          {appConfig && (
            <span className="ml-auto text-xs text-gray-500">
              Active: <span className="text-gray-300">{appConfig.aiProvider}</span>
              {appConfig.ollamaModel && <span className="text-gray-500"> ({appConfig.ollamaModel})</span>}
            </span>
          )}
        </div>

        {/* Provider cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PROVIDERS.map((p) => {
            const isActive = appConfig?.aiProvider === p.id;
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                onClick={() => {
                  if (isActive) return;
                  if (p.id === 'ollama' && !aiModels?.ollamaOnline) {
                    toast.error('Ollama is not running. Start it with: ollama serve');
                    return;
                  }
                  toast.promise(
                    setProviderMut.mutateAsync({ provider: p.id }),
                    {
                      loading: `Switching to ${p.label}...`,
                      success: `Now using ${p.label}`,
                      error: `Failed to switch`,
                    },
                  );
                }}
                disabled={setProviderMut.isPending}
                className={`relative rounded-xl border p-4 text-left transition-all ${
                  isActive
                    ? 'border-cyan-500 bg-cyan-500/5'
                    : 'border-gray-700 hover:border-gray-600'
                } disabled:opacity-50`}
              >
                {isActive && (
                  <div className="absolute top-2 right-2">
                    <Check size={14} className="text-cyan-400" />
                  </div>
                )}
                <Icon size={20} className={p.color} />
                <div className="mt-2 text-sm font-medium">{p.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{p.desc}</div>
                {p.id === 'ollama' && (
                  <div className={`mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full inline-block ${
                    aiModels?.ollamaOnline
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {aiModels?.ollamaOnline ? 'Online' : 'Offline'}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Ollama model selector */}
        {appConfig?.aiProvider === 'ollama' && aiModels?.ollamaOnline && aiModels.models.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400">Local Model</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {aiModels.models.map((m) => {
                const isSelected = appConfig.ollamaModel === m.name;
                const fitsRam = m.sizeGB < 16;
                return (
                  <button
                    key={m.name}
                    onClick={() => {
                      if (isSelected) return;
                      toast.promise(
                        setProviderMut.mutateAsync({ provider: 'ollama', ollamaModel: m.name }),
                        {
                          loading: `Switching to ${m.name}...`,
                          success: `Now using ${m.name}`,
                          error: `Failed to switch`,
                        },
                      );
                    }}
                    disabled={setProviderMut.isPending}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/5'
                        : 'border-gray-700 hover:border-gray-600'
                    } disabled:opacity-50`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono truncate">{m.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {m.sizeGB} GB
                        {!fitsRam && <span className="text-red-400 ml-1">(may not fit 24GB)</span>}
                      </div>
                    </div>
                    {isSelected && <Check size={14} className="text-cyan-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Blacklist */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-red-400" />
          <h2 className="text-lg font-semibold">Domain / Phone Blacklist</h2>
        </div>
        <p className="text-sm text-gray-400">
          Excluded domains and phone numbers will be skipped during outreach. Leads matching these will not receive emails.
        </p>

        {/* Add form */}
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'domain' | 'phone')}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-cyan-500 focus:outline-none"
            >
              <option value="domain">Domain</option>
              <option value="phone">Phone</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-400 mb-1">
              {type === 'domain' ? 'Domain' : 'Phone Number'}
            </label>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === 'domain' ? 'example.com' : '+1234567890'}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
              required
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-medium text-gray-400 mb-1">Reason (optional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Existing client"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={addMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        </form>

        {/* List */}
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : blacklist && blacklist.length > 0 ? (
          <div className="space-y-1.5">
            {blacklist.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-4 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    item.domain
                      ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {item.domain ? 'Domain' : 'Phone'}
                  </span>
                  <span className="text-sm font-mono text-gray-200 truncate">
                    {item.domain || item.phone}
                  </span>
                  <span className="text-xs text-gray-500 truncate">{item.reason}</span>
                </div>
                <button
                  onClick={() => removeMutation.mutate(item.id)}
                  disabled={removeMutation.isPending}
                  className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition shrink-0 disabled:opacity-50"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No exclusions configured.</p>
        )}
      </section>
    </div>
  );
}
