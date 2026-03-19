import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, X, Star, Eye, ChevronDown, ChevronUp, Globe, Phone, MessageCircle, Calendar, Bot, AlertTriangle, Play, ExternalLink } from 'lucide-react';
import { useCampaign, useLaunchCampaign } from '../hooks/useCampaigns';
import { useLeads, useApproveLead, useSkipLead, useConvertLead, useEmailPreview, type LeadParams } from '../hooks/useLeads';

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
  const launchMutation = useLaunchCampaign();
  const [filter, setFilter] = useState<LeadParams>({ status: 'qualified' });
  const { data: leads } = useLeads(id!, filter);
  const approveMut = useApproveLead();
  const skipMut = useSkipLead();
  const convertMut = useConvertLead();
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [previewLead, setPreviewLead] = useState<string | null>(null);
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

      {/* Section heading */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {filter.status === 'qualified' ? 'Ready for Review' : filter.status ? `${filter.status} leads` : 'All Leads'}
          <span className="text-gray-500 text-sm font-normal ml-2">({leads?.length ?? 0})</span>
        </h2>
      </div>

      {/* Lead Cards */}
      <div className="space-y-3">
        {leads && leads.length > 0 ? leads.map((lead: any) => {
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
                  {score ?? '—'}
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
                    <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-md flex items-center gap-1">
                      <Bot size={10} /> Chatbot
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
                      <button
                        onClick={() => setPreviewLead(isPreviewing ? null : lead.id)}
                        className={`p-2 rounded-lg transition ${isPreviewing ? 'bg-cyan-400/20 text-cyan-300' : 'text-cyan-400 hover:bg-cyan-400/10'}`}
                        title="Preview email"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Send outreach email to ${lead.email}?`)) approveMut.mutate(lead.id); }}
                        className="p-2 text-green-400 hover:bg-green-400/10 rounded-lg transition"
                        title="Send email"
                      >
                        <Send size={16} />
                      </button>
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
                    <button
                      onClick={() => { if (confirm(`Send this email to ${lead.email}?`)) { approveMut.mutate(lead.id); setPreviewLead(null); } }}
                      className="flex items-center gap-2 bg-green-500 text-black px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-400 transition"
                    >
                      <Send size={12} /> Send This Email
                    </button>
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
                      <InfoBox label="Rating" value={lead.googleRating ? `${lead.googleRating}★ (${lead.googleReviewCount} reviews)` : 'N/A'} />
                      <InfoBox label="Emails Found" value={enrichment?.emailsFound?.length ? enrichment.emailsFound.join(', ') : 'None'} />
                    </div>

                    {painSignals.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1.5">Pain Signals from Reviews:</p>
                        <div className="space-y-1">
                          {painSignals.map((ps: any, i: number) => (
                            <div key={i} className="text-xs bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5 text-red-300">
                              <span className="font-semibold">{ps.signal}</span> ({ps.count}x) — &ldquo;{ps.example}&rdquo;
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
            {leads ? (filter.status === 'qualified' ? 'No leads waiting for review. Pipeline may still be processing.' : `No ${filter.status || ''} leads found.`) : 'Loading...'}
          </div>
        )}
      </div>
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
