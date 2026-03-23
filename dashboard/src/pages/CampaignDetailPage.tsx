import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, X, Star, Eye, ChevronDown, ChevronUp, Globe, Phone, MessageCircle, Calendar, Bot, AlertTriangle, Play, ExternalLink, Pause, Trash2, MousePointerClick, Loader2, Download, Copy, Clock, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useCampaign, useLaunchCampaign, useStopCampaign, useDeleteCampaign, useCloneCampaign, exportCampaignCsv } from '../hooks/useCampaigns';
import { useLeads, useApproveLead, useSkipLead, useConvertLead, useEmailPreview, useCampaignAnalytics, useAppConfig, type LeadParams, type Lead } from '../hooks/useLeads';

const PAGE_SIZE = 50;

const statusColor: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  paused: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  sourced: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  enriched: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  qualified: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  contacted: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  replied: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  converted: 'bg-green-500/10 text-green-400 border-green-500/20',
  unsubscribed: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const funnelStages = ['sourced', 'enriched', 'qualified', 'contacted', 'replied', 'converted'] as const;

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: campaign } = useCampaign(id!);
  const { data: analytics } = useCampaignAnalytics(id!);
  const launchMutation = useLaunchCampaign();
  const stopMutation = useStopCampaign();
  const deleteMutation = useDeleteCampaign();
  const cloneMutation = useCloneCampaign();
  const nav = useNavigate();
  const [filter, setFilter] = useState<LeadParams>({ status: 'qualified' });
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Pagination state
  const [offset, setOffset] = useState(0);
  const [accumulated, setAccumulated] = useState<Lead[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: freshLeads, isFetching } = useLeads(id!, { ...filter, search: debouncedSearch || undefined, limit: PAGE_SIZE, offset });

  // Reset accumulated leads when filter or search changes
  useEffect(() => {
    setOffset(0);
    setAccumulated([]);
  }, [filter.status, filter.minScore, filter.maxScore, debouncedSearch]);

  // Append fetched leads to accumulated list
  useEffect(() => {
    if (!freshLeads) return;
    if (offset === 0) {
      setAccumulated(freshLeads);
    } else {
      setAccumulated(prev => {
        const existingIds = new Set(prev.map(l => l.id));
        const newLeads = freshLeads.filter(l => !existingIds.has(l.id));
        return [...prev, ...newLeads];
      });
    }
    setLoadingMore(false);
  }, [freshLeads, offset]);

  const handleLoadMore = useCallback(() => {
    setLoadingMore(true);
    setOffset(prev => prev + PAGE_SIZE);
  }, []);

  const leads = debouncedSearch
    ? accumulated.filter((l: any) => l.businessName?.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : accumulated;
  const hasMore = freshLeads?.length === PAGE_SIZE;

  const { data: appConfig } = useAppConfig();
  const emailEnabled = appConfig?.emailEnabled ?? false;
  const approveMut = useApproveLead();
  const skipMut = useSkipLead();
  const convertMut = useConvertLead();
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [previewLead, setPreviewLead] = useState<string | null>(null);
  const [sendProgress, setSendProgress] = useState<{ total: number; sent: number; failed: number; label: string } | null>(null);
  const { data: preview, isLoading: previewLoading } = useEmailPreview(previewLead);

  if (!campaign) return <p className="text-sm text-gray-500">Loading...</p>;

  const canSend = (lead: any) => lead.status === 'qualified' && lead.email && lead.qualification;

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
            {campaign.vertical} — {campaign.regions?.join(', ')}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusColor[campaign.status] ?? statusColor.draft}`}>
          {campaign.status}
        </span>
        {campaign.status === 'draft' && (
          <button
            onClick={() => launchMutation.mutate(id!)}
            className="flex items-center gap-2 bg-green-500 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-400"
          >
            <Play size={16} /> Launch
          </button>
        )}
        {campaign.status === 'active' && (
          <button
            onClick={() => { if (confirm('Stop this campaign? Pipeline will pause.')) stopMutation.mutate(id!); }}
            className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-500/20"
          >
            <Pause size={16} /> Stop
          </button>
        )}
        {campaign.status === 'paused' && (
          <button
            onClick={() => launchMutation.mutate(id!)}
            className="flex items-center gap-2 bg-green-500 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-400"
          >
            <Play size={16} /> Resume
          </button>
        )}
        <button
          onClick={() => exportCampaignCsv(id!)}
          className="flex items-center gap-2 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors"
          title="Download CSV"
        >
          <Download size={16} />
        </button>
        <button
          onClick={() => cloneMutation.mutate(id!, { onSuccess: (data) => nav(`/campaigns/${data.id}`) })}
          disabled={cloneMutation.isPending}
          className="flex items-center gap-2 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
          title="Clone campaign"
        >
          <Copy size={16} />
        </button>
        <button
          onClick={() => { if (confirm(`Delete "${campaign.name}" and ALL its leads? This cannot be undone.`)) deleteMutation.mutate(id!, { onSuccess: () => nav('/campaigns') }); }}
          className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm hover:bg-red-500/20"
          title="Delete campaign"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Funnel filter */}
      {campaign.stats && (() => {
        const stats = campaign.stats as Record<string, number>;
        return (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter({})}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                !filter.status ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              All
            </button>
            {funnelStages.map((stage) => (
              <button
                key={stage}
                onClick={() => setFilter({ status: stage })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter.status === stage ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {stage.charAt(0).toUpperCase() + stage.slice(1)}{' '}
                <span className="text-gray-500">({stats[stage] ?? 0})</span>
              </button>
            ))}
          </div>
        );
      })()}

      {/* Analytics summary */}
      {analytics && analytics.sent > 0 && (
        <div className="flex flex-wrap gap-3">
          <AnalyticsStat label="Open Rate" value={`${analytics.rates.openRate}%`} icon={<Eye size={14} />} color="text-violet-400" />
          <AnalyticsStat label="Click Rate" value={`${analytics.rates.clickRate}%`} icon={<MousePointerClick size={14} />} color="text-amber-400" />
          <AnalyticsStat label="Reply Rate" value={`${analytics.rates.replyRate}%`} icon={<MessageCircle size={14} />} color="text-green-400" />
          <AnalyticsStat label="Sent" value={String(analytics.sent)} icon={<Send size={14} />} color="text-cyan-400" />
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by business name..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Section heading + bulk actions + progress */}
      {(() => {
        const sendableLeads = leads.filter((l: any) => l.status === 'qualified' && l.email && l.qualification);
        const sendableCount = sendableLeads.length;

        const handleSendAll = async () => {
          if (!confirm(`Send NOW to all ${sendableCount} leads? (bypasses timezone scheduling)`)) return;
          setSendProgress({ total: sendableCount, sent: 0, failed: 0, label: 'Sending' });
          let sent = 0;
          let failed = 0;
          for (let i = 0; i < sendableLeads.length; i += 3) {
            const batch = sendableLeads.slice(i, i + 3);
            const results = await Promise.allSettled(
              batch.map((l: any) => approveMut.mutateAsync({ id: l.id, sendNow: true }))
            );
            sent += results.filter(r => r.status === 'fulfilled').length;
            failed += results.filter(r => r.status === 'rejected').length;
            setSendProgress({ total: sendableCount, sent, failed, label: 'Sending' });
          }
          if (failed === 0) {
            toast.success(`All ${sent} emails sent!`);
          } else {
            toast.error(`${sent} sent, ${failed} failed`);
          }
          setTimeout(() => setSendProgress(null), 3000);
        };

        const handleScheduleAll = async () => {
          if (!confirm(`Schedule ${sendableCount} leads for 9am in their timezone?`)) return;
          setSendProgress({ total: sendableCount, sent: 0, failed: 0, label: 'Scheduling' });
          let sent = 0;
          let failed = 0;
          for (let i = 0; i < sendableLeads.length; i += 3) {
            const batch = sendableLeads.slice(i, i + 3);
            const results = await Promise.allSettled(
              batch.map((l: any) => approveMut.mutateAsync({ id: l.id, sendNow: false }))
            );
            sent += results.filter(r => r.status === 'fulfilled').length;
            failed += results.filter(r => r.status === 'rejected').length;
            setSendProgress({ total: sendableCount, sent, failed, label: 'Scheduling' });
          }
          if (failed === 0) {
            toast.success(`All ${sent} emails scheduled`);
          } else {
            toast.error(`${sent} scheduled, ${failed} failed`);
          }
          setTimeout(() => setSendProgress(null), 3000);
        };

        const handleSkipAll = async () => {
          if (!confirm(`Skip all ${sendableCount} qualified leads?`)) return;
          setSendProgress({ total: sendableCount, sent: 0, failed: 0, label: 'Skipping' });
          let sent = 0;
          let failed = 0;
          for (let i = 0; i < sendableLeads.length; i += 3) {
            const batch = sendableLeads.slice(i, i + 3);
            const results = await Promise.allSettled(
              batch.map((l: any) => skipMut.mutateAsync(l.id))
            );
            sent += results.filter(r => r.status === 'fulfilled').length;
            failed += results.filter(r => r.status === 'rejected').length;
            setSendProgress({ total: sendableCount, sent, failed, label: 'Skipping' });
          }
          if (failed === 0) {
            toast.success(`${sent} leads skipped`);
          } else {
            toast.error(`${sent} skipped, ${failed} failed`);
          }
          setTimeout(() => setSendProgress(null), 3000);
        };

        const isBusy = !!sendProgress;
        const done = sendProgress ? sendProgress.sent + sendProgress.failed : 0;
        const pct = sendProgress ? Math.round((done / sendProgress.total) * 100) : 0;

        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {filter.status === 'qualified' ? 'Ready for Review' : filter.status ? `${filter.status} leads` : 'All Leads'}
                <span className="text-gray-500 text-sm font-normal ml-2">({leads.length}{hasMore ? '+' : ''})</span>
              </h2>
              {sendableCount > 0 && !isBusy && (
                <div className="flex gap-2">
                  {emailEnabled && (
                    <>
                      <button
                        onClick={handleSendAll}
                        className="flex items-center gap-2 bg-green-500 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-400 transition"
                      >
                        <Send size={14} />
                        Send All Now ({sendableCount})
                      </button>
                      <button
                        onClick={handleScheduleAll}
                        className="flex items-center gap-2 border border-cyan-700 text-cyan-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-cyan-400/10 transition"
                      >
                        <Clock size={14} />
                        Schedule All ({sendableCount})
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleSkipAll}
                    className="flex items-center gap-2 border border-gray-700 text-gray-400 px-4 py-2 rounded-lg text-sm hover:border-gray-600 hover:text-gray-300 transition"
                  >
                    <X size={14} />
                    Skip All
                  </button>
                </div>
              )}
            </div>

            {/* Inline progress bar */}
            {sendProgress && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-cyan-400" />
                    <span className="text-gray-200 font-medium">
                      {sendProgress.label}... {done}/{sendProgress.total}
                    </span>
                  </div>
                  <span className="text-gray-400 text-xs">
                    {sendProgress.sent > 0 && <span className="text-green-400">{sendProgress.sent} sent</span>}
                    {sendProgress.failed > 0 && <span className="text-red-400 ml-2">{sendProgress.failed} failed</span>}
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Lead Cards */}
      <div className="space-y-3">
        {leads.length > 0 ? leads.map((lead: any) => {
          const isExpanded = expandedLead === lead.id;
          const isPreviewing = previewLead === lead.id;
          const enrichment = lead.enrichment;
          const qualification = lead.qualification;
          const painSignals = (enrichment?.painSignals as any[]) ?? [];
          const score = qualification?.fitScore;

          return (
            <div key={lead.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {/* Lead Header */}
              <div className="p-4 flex items-center gap-4">
                {/* Score */}
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg shrink-0 ${
                  score >= 70 ? 'bg-green-500/20 text-green-400' :
                  score >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
                  score != null ? 'bg-red-500/20 text-red-400' :
                  'bg-gray-700/20 text-gray-500'
                }`}>
                  {score ?? '\u2014'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{lead.businessName}</div>
                  <div className="text-sm text-gray-500 flex items-center gap-3 mt-0.5">
                    {lead.email && <span className="truncate">{lead.email}</span>}
                    {lead.region && <span>{lead.region}</span>}
                  </div>
                </div>

                {/* Signals */}
                <div className="flex gap-1.5 shrink-0 flex-wrap">
                  {enrichment?.hasWhatsapp && (
                    <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-1 rounded-md flex items-center gap-1">
                      <MessageCircle size={10} /> WhatsApp
                    </span>
                  )}
                  {enrichment?.hasChatbot && (
                    <span
                      className="text-[10px] bg-orange-500/20 text-orange-400 px-2 py-1 rounded-md flex items-center gap-1"
                      title="Has existing chatbot — upgrade pitch"
                    >
                      <Bot size={10} /> Competitor
                    </span>
                  )}
                  {enrichment?.hasOnlineBooking && (
                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded-md flex items-center gap-1">
                      <Calendar size={10} /> Booking
                    </span>
                  )}
                  {!lead.email && (
                    <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-1 rounded-md flex items-center gap-1">
                      <AlertTriangle size={10} /> No Email
                    </span>
                  )}
                </div>

                {/* Status */}
                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium shrink-0 ${statusColor[lead.status] ?? statusColor.sourced}`}>
                  {lead.status}
                </span>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  {canSend(lead) && (
                    <>
                      {emailEnabled && (
                        <>
                          <button
                            onClick={() => setPreviewLead(isPreviewing ? null : lead.id)}
                            className={`p-2 rounded-lg transition ${isPreviewing ? 'bg-cyan-400/20 text-cyan-300' : 'text-cyan-400 hover:bg-cyan-400/10'}`}
                            title="Preview email"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => {
                              if (!confirm(`Send NOW to ${lead.email}?`)) return;
                              toast.promise(approveMut.mutateAsync({ id: lead.id, sendNow: true }), {
                                loading: `Sending to ${lead.email}...`,
                                success: `Email sent to ${lead.businessName}`,
                                error: `Failed to send to ${lead.email}`,
                              });
                            }}
                            className="p-2 text-green-400 hover:bg-green-400/10 rounded-lg transition"
                            title="Send now"
                          >
                            <Send size={16} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => skipMut.mutate(lead.id)}
                        className="p-2 text-gray-400 hover:bg-gray-400/10 rounded-lg transition"
                        title="Skip this lead"
                      >
                        <X size={16} />
                      </button>
                    </>
                  )}
                  {lead.status === 'replied' && (
                    <button
                      onClick={() => convertMut.mutate(lead.id)}
                      className="p-2 text-cyan-400 hover:bg-cyan-400/10 rounded-lg transition"
                      title="Mark converted"
                    >
                      <Star size={16} />
                    </button>
                  )}
                  {lead.demoToken && (
                    <a href={`/demo/${lead.demoToken}`} target="_blank" className="p-2 text-gray-400 hover:text-gray-200 rounded-lg transition" title="View demo page">
                      <ExternalLink size={16} />
                    </a>
                  )}
                  <button
                    onClick={() => { setExpandedLead(isExpanded ? null : lead.id); if (isPreviewing) setPreviewLead(null); }}
                    className="p-2 text-gray-400 hover:text-gray-200 rounded-lg transition"
                    title="Toggle details"
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Email Preview */}
              {isPreviewing && (
                <div className="border-t border-gray-800 bg-gray-950 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-cyan-400">Email Preview</h3>
                    {emailEnabled && (
                      <button
                        onClick={() => {
                          if (!confirm(`Send NOW to ${lead.email}?`)) return;
                          toast.promise(approveMut.mutateAsync({ id: lead.id, sendNow: true }), {
                            loading: `Sending to ${lead.email}...`,
                            success: `Email sent to ${lead.businessName}`,
                            error: `Failed to send to ${lead.email}`,
                          });
                          setPreviewLead(null);
                        }}
                        className="flex items-center gap-2 bg-green-500 text-black px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-400 transition"
                      >
                        <Send size={12} /> Send This Email
                      </button>
                    )}
                  </div>
                  {previewLoading ? (
                    <p className="text-gray-500 text-sm">Loading preview...</p>
                  ) : preview ? (
                    <div className="space-y-3">
                      <div className="text-xs text-gray-500">
                        <span className="text-gray-400">To:</span> {preview.to} &nbsp;|&nbsp;
                        <span className="text-gray-400">From:</span> {preview.from} &nbsp;|&nbsp;
                        <span className="text-gray-400">Subject:</span> <span className="text-gray-200">{preview.subject}</span>
                      </div>
                      <div className="rounded-lg overflow-hidden border border-gray-700" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                        <iframe srcDoc={preview.html} className="w-full border-0" style={{ height: '400px' }} title="Email Preview" />
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Expanded Details */}
              {isExpanded && (
                <div className="border-t border-gray-800 bg-gray-950/50 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: Enrichment */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Enrichment Data</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <InfoBox label="Website" value={lead.websiteUrl || 'Not found'} icon={<Globe size={12} />} />
                      <InfoBox label="Phone" value={lead.phone || 'Not found'} icon={<Phone size={12} />} />
                      <InfoBox label="Rating" value={lead.googleRating ? `${lead.googleRating}\u2605 (${lead.googleReviewCount} reviews)` : 'N/A'} />
                      <InfoBox label="Emails Found" value={enrichment?.emailsFound?.length ? enrichment.emailsFound.join(', ') : 'None'} />
                      {enrichment?.ownerName && (
                        <InfoBox label="Owner" value={enrichment.ownerName} />
                      )}
                    </div>

                    {painSignals.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1.5">Pain Signals from Reviews:</p>
                        <div className="space-y-1">
                          {painSignals.map((ps: any, i: number) => (
                            <div key={i} className="text-xs bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5 text-red-300">
                              <span className="font-semibold">{ps.signal}</span> ({ps.count}x) &mdash; &ldquo;{ps.example}&rdquo;
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {enrichment?.reviewSentimentSummary && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Review Sentiment:</p>
                        <p className="text-xs text-gray-300 bg-gray-800 rounded-md px-3 py-2">{enrichment.reviewSentimentSummary}</p>
                      </div>
                    )}
                  </div>

                  {/* Right: AI Qualification */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">AI Qualification</h3>
                    {qualification ? (
                      <>
                        <div className="bg-gray-800 rounded-md px-3 py-2">
                          <p className="text-xs text-gray-400 mb-1">Score Reasoning:</p>
                          <p className="text-xs text-gray-300">{qualification.scoreReasoning}</p>
                        </div>
                        <div className="bg-gray-800 rounded-md px-3 py-2">
                          <p className="text-xs text-gray-400 mb-1">Personalized Hook:</p>
                          <p className="text-xs text-gray-200 italic">&ldquo;{qualification.personalizedHook}&rdquo;</p>
                        </div>
                        {qualification.demoPageData && (
                          <div className="bg-gray-800 rounded-md px-3 py-2">
                            <p className="text-xs text-gray-400 mb-1">Demo Scenario:</p>
                            <div className="text-xs space-y-1">
                              <p className="text-gray-400">Customer: <span className="text-gray-200">{(qualification.demoPageData as any).customerMessage}</span></p>
                              <p className="text-gray-400">Bot: <span className="text-green-300">{(qualification.demoPageData as any).botReply}</span></p>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-gray-500">Not yet qualified</p>
                    )}

                    {/* Outreach Timeline */}
                    {lead.outreachEmails?.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1.5">Outreach Timeline:</p>
                        <div className="space-y-1">
                          {lead.outreachEmails.map((email: any) => (
                            <div key={email.id} className="text-xs flex items-center gap-2 bg-gray-800 rounded-md px-3 py-1.5">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${
                                email.status === 'delivered' ? 'bg-green-400' :
                                email.status === 'opened' ? 'bg-cyan-400' :
                                email.status === 'clicked' ? 'bg-emerald-400' :
                                email.status === 'sending' ? 'bg-yellow-400' :
                                email.status === 'failed' ? 'bg-red-400' :
                                'bg-gray-500'
                              }`} />
                              <span className="text-gray-400">Email {email.sequenceNumber}:</span>
                              <span className="text-gray-300">{email.status}</span>
                              {email.sentAt && <span className="text-gray-500 ml-auto">{new Date(email.sentAt).toLocaleDateString()}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {lead.lastError && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                        <p className="text-xs text-red-400">Error: {lead.lastError}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        }) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
            {leads !== undefined ? (filter.status === 'qualified' ? 'No leads waiting for review. Pipeline may still be processing.' : `No ${filter.status || ''} leads found.`) : 'Loading...'}
          </div>
        )}

        {/* Load More button */}
        {hasMore && (
          <div className="flex justify-center pt-2">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore || isFetching}
              className="flex items-center gap-2 rounded-lg border border-gray-700 px-6 py-2.5 text-sm font-medium text-gray-300 hover:border-gray-600 hover:text-gray-100 transition disabled:opacity-50"
            >
              {loadingMore || isFetching ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Loading...
                </>
              ) : (
                <>Load More</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyticsStat({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900 px-4 py-2.5">
      <span className={color}>{icon}</span>
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm font-semibold ml-1">{value}</span>
    </div>
  );
}

function InfoBox({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-md px-3 py-2">
      <div className="text-[10px] text-gray-500 flex items-center gap-1 mb-0.5">{icon}{label}</div>
      <div className="text-xs text-gray-300 truncate">{value}</div>
    </div>
  );
}
