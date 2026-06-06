'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { upload } from '@vercel/blob/client';
import type { Fund } from '@/lib/types';

const DESCRIPTION_THRESHOLD = 120;

function TruncatedDescription({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > DESCRIPTION_THRESHOLD;
  return (
    <p className={className}>
      {isLong && !expanded ? `${text.slice(0, DESCRIPTION_THRESHOLD).trimEnd()}… ` : `${text} `}
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-amber-400 hover:text-amber-300 font-medium transition-colors whitespace-nowrap"
        >
          {expanded ? 'Read less' : 'Read more'}
        </button>
      )}
    </p>
  );
}

interface Profile {
  studentId: string;
  studentName: string;
}

type View = 'loading' | 'landing' | 'app' | 'reset';
type Tab = 'fund' | 'browse' | 'allocate';

export default function StudentPage() {
  const [view, setView] = useState<View>('loading');
  const [tab, setTab] = useState<Tab>('fund');
  const [profile, setProfile] = useState<Profile | null>(null);

  // Registration
  const [nameInput, setNameInput] = useState('');
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [fingerprintLoading, setFingerprintLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState('');

  // Shared data
  const [funds, setFunds] = useState<Fund[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [uploadsOpen, setUploadsOpen] = useState(false);
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [capitalBudget, setCapitalBudget] = useState(100);

  // My Fund form
  const [fundName, setFundName] = useState('');
  const [fundDesc, setFundDesc] = useState('');
  const [fundFile, setFundFile] = useState<File | null>(null);
  const [savingFund, setSavingFund] = useState(false);
  const [fundError, setFundError] = useState('');
  const [editingMine, setEditingMine] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Allocation
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [allocError, setAllocError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const myFund = profile ? funds.find(f => f.ownerStudentId === profile.studentId) ?? null : null;

  const totalAllocated = Object.values(amounts).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  const remaining = capitalBudget - totalAllocated;
  const overBudget = totalAllocated > capitalBudget;

  const fetchData = useCallback(async () => {
    try {
      const [fundsData, stateData] = await Promise.all([
        fetch('/api/funds').then(r => r.json()),
        fetch('/api/state').then(r => r.json()),
      ]);
      if (Array.isArray(fundsData)) setFunds(fundsData);
      setUploadsOpen(Boolean(stateData?.uploadsOpen));
      setSubmissionsOpen(Boolean(stateData?.submissionsOpen));
      if (typeof stateData?.capitalBudget === 'number') setCapitalBudget(stateData.capitalBudget);
    } catch {
      // silent — keep last good data
    }
  }, []);

  // Restore session on load.
  useEffect(() => {
    const stored = localStorage.getItem('pevc_profile');
    if (!stored) {
      setView('landing');
      return;
    }
    try {
      const p: Profile = JSON.parse(stored);
      setProfile(p);
      setSubmitted(localStorage.getItem('pevc_submitted') === 'true');
      setView('app');
      setDataLoading(true);
      fetchData().finally(() => setDataLoading(false));
    } catch {
      localStorage.removeItem('pevc_profile');
      setView('landing');
    }
  }, [fetchData]);

  // Generate a device fingerprint on the landing page.
  useEffect(() => {
    if (view !== 'landing') return;
    // Pull the current budget so the intro copy is accurate.
    fetch('/api/state')
      .then(r => r.json())
      .then(s => { if (typeof s?.capitalBudget === 'number') setCapitalBudget(s.capitalBudget); })
      .catch(() => {});
    setFingerprintLoading(true);
    import('@fingerprintjs/fingerprintjs')
      .then(FingerprintJS => FingerprintJS.load())
      .then(fp => fp.get())
      .then(result => setFingerprint(result.visitorId))
      .catch(() => setRegError('Could not verify your device. Please refresh and try again.'))
      .finally(() => setFingerprintLoading(false));
  }, [view]);

  // Refresh funds + gates every 5s while in the app.
  useEffect(() => {
    if (view !== 'app') return;
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, [view, fetchData]);

  // Validate session every 5s while in the app.
  useEffect(() => {
    if (view !== 'app' || !profile?.studentId) return;
    const id = setInterval(() => {
      fetch(`/api/students/${profile.studentId}/validate`)
        .then(r => r.json())
        .then(data => {
          if (data.valid === false) {
            localStorage.removeItem('pevc_profile');
            localStorage.removeItem('pevc_submitted');
            setView('reset');
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [view, profile]);

  const enterApp = (p: Profile) => {
    setProfile(p);
    setView('app');
    setTab('fund');
    setDataLoading(true);
    fetchData().finally(() => setDataLoading(false));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || !fingerprint) return;
    setRegistering(true);
    setRegError('');
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.trim(), fingerprint }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error || 'Registration failed. Please try again.');
        return;
      }
      const p: Profile = { studentId: data.studentId, studentName: data.studentName };
      localStorage.setItem('pevc_profile', JSON.stringify(p));
      enterApp(p);
    } catch {
      setRegError('Network error. Please try again.');
    } finally {
      setRegistering(false);
    }
  };

  // Upload the chosen PDF straight to Vercel Blob, then create/replace the fund.
  const uploadPdf = async (file: File, mode: 'create' | 'replace') => {
    if (!profile) throw new Error('No profile');
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const pathname = `fund-pdfs/${profile.studentId}-${Date.now()}-${safe}`;
    const blob = await upload(pathname, file, {
      access: 'public',
      handleUploadUrl: '/api/funds/upload',
      contentType: 'application/pdf',
      clientPayload: JSON.stringify({ studentId: profile.studentId, mode }),
    });
    return blob.url;
  };

  const handleCreateFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!fundName.trim()) return setFundError('Give your fund a name.');
    if (!fundFile) return setFundError('Attach your pitch PDF.');
    if (fundFile.type !== 'application/pdf') return setFundError('The file must be a PDF.');

    setSavingFund(true);
    setFundError('');
    try {
      const pdfUrl = await uploadPdf(fundFile, 'create');
      const res = await fetch('/api/funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fundName.trim(),
          description: fundDesc.trim(),
          studentId: profile.studentId,
          studentName: profile.studentName,
          pdfUrl,
          pdfName: fundFile.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save your fund.');
      setFundName('');
      setFundDesc('');
      setFundFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchData();
    } catch (err) {
      setFundError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setSavingFund(false);
    }
  };

  const handleUpdateMine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !myFund) return;
    if (!fundName.trim()) return setFundError('Give your fund a name.');
    setSavingFund(true);
    setFundError('');
    try {
      let pdfUrl: string | undefined;
      let pdfName: string | undefined;
      if (fundFile) {
        if (fundFile.type !== 'application/pdf') throw new Error('The file must be a PDF.');
        pdfUrl = await uploadPdf(fundFile, 'replace');
        pdfName = fundFile.name;
      }
      const res = await fetch(`/api/funds/${myFund.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: profile.studentId,
          name: fundName.trim(),
          description: fundDesc.trim(),
          ...(pdfUrl ? { pdfUrl, pdfName } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update your fund.');
      setFundFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setEditingMine(false);
      await fetchData();
    } catch (err) {
      setFundError(err instanceof Error ? err.message : 'Update failed. Please try again.');
    } finally {
      setSavingFund(false);
    }
  };

  const handleDeleteMine = async () => {
    if (!profile || !myFund) return;
    if (!confirm('Withdraw your fund? This removes your pitch and its PDF.')) return;
    setSavingFund(true);
    setFundError('');
    try {
      const res = await fetch(`/api/funds/${myFund.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: profile.studentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not withdraw your fund.');
      }
      setEditingMine(false);
      await fetchData();
    } catch (err) {
      setFundError(err instanceof Error ? err.message : 'Delete failed. Please try again.');
    } finally {
      setSavingFund(false);
    }
  };

  const handleAmountChange = (fundId: string, value: string) => {
    if (value === '' || /^\d*\.?\d{0,1}$/.test(value)) {
      setAmounts(prev => ({ ...prev, [fundId]: value }));
      setAllocError('');
    }
  };

  const handleSubmitAllocation = async () => {
    if (!profile) return;
    if (overBudget) return setAllocError(`Total allocation cannot exceed $${capitalBudget.toLocaleString()}M`);
    setSubmitting(true);
    setAllocError('');
    try {
      const allocations = Object.entries(amounts)
        .filter(([fundId, v]) => parseFloat(v) > 0 && fundId !== myFund?.id)
        .map(([fundId, v]) => ({ fundId, amount: parseFloat(v) }));
      const res = await fetch('/api/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: profile.studentId,
          studentName: profile.studentName,
          allocations,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Submission failed');
      }
      localStorage.setItem('pevc_submitted', 'true');
      setSubmitted(true);
    } catch (err) {
      setAllocError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Loading / Reset / Landing ----------

  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (view === 'reset') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-5 text-2xl">
            🔄
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Session Reset</h1>
          <p className="text-slate-400 mb-6">Your session was reset by the instructor.</p>
          <button
            onClick={() => { setProfile(null); setFunds([]); setView('landing'); }}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl px-5 py-3 text-sm transition-colors"
          >
            Create New Profile
          </button>
        </div>
      </div>
    );
  }

  if (view === 'landing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-amber-400 text-xs font-semibold tracking-widest uppercase mb-5">
              PE / VC Seminar
            </div>
            <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">Fund Allocator</h1>
            <p className="text-slate-400 leading-relaxed">
              Pitch your own fund, review everyone else&apos;s, then deploy{' '}
              <span className="text-amber-400 font-semibold">${capitalBudget.toLocaleString()}M</span> across the field.
            </p>
          </div>

          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <h2 className="text-white font-semibold text-base mb-1">Create Your LP Profile</h2>
            <p className="text-slate-500 text-sm mb-5">Enter your name to begin.</p>
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="e.g. Jane Smith"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                  autoFocus
                />
              </div>
              {regError && (
                <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {regError}
                </p>
              )}
              <button
                type="submit"
                disabled={!nameInput.trim() || fingerprintLoading || registering}
                className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold rounded-xl px-4 py-3.5 transition-colors text-sm"
              >
                {fingerprintLoading ? 'Verifying device…' : registering ? 'Registering…' : 'Enter →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Main app (tabbed) ----------

  const pct = Math.min((totalAllocated / capitalBudget) * 100, 100);

  const TabButton = ({ id, label }: { id: Tab; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
        tab === id ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-white font-semibold text-sm leading-tight">{profile?.studentName}</div>
              <div className="text-slate-500 text-xs">LP Profile</div>
            </div>
            {tab === 'allocate' && !submitted && (
              <div className="text-right">
                <div className={`font-mono font-bold text-base leading-tight ${
                  overBudget ? 'text-red-400' : totalAllocated >= capitalBudget ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  ${totalAllocated.toFixed(1)}M
                  <span className="text-slate-600 text-xs font-normal"> / ${capitalBudget.toLocaleString()}M</span>
                </div>
                <div className={`text-xs ${overBudget ? 'text-red-400' : 'text-slate-500'}`}>
                  {overBudget
                    ? `$${(totalAllocated - capitalBudget).toFixed(1)}M over budget`
                    : `$${remaining.toFixed(1)}M remaining`}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-1 bg-slate-900 rounded-xl p-1 border border-slate-800">
            <TabButton id="fund" label="My Fund" />
            <TabButton id="browse" label={`Browse${funds.length ? ` (${funds.length})` : ''}`} />
            <TabButton id="allocate" label="Allocate" />
          </div>
        </div>
        {tab === 'allocate' && !submitted && (
          <div className="h-0.5 bg-slate-800">
            <div
              className={`h-full transition-all duration-300 ${overBudget ? 'bg-red-500' : 'bg-amber-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6">
        {dataLoading && funds.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">Loading…</div>
        ) : (
          <>
            {tab === 'fund' && (
              <MyFundTab
                myFund={myFund}
                uploadsOpen={uploadsOpen}
                editing={editingMine}
                fundName={fundName}
                fundDesc={fundDesc}
                fundFile={fundFile}
                saving={savingFund}
                error={fundError}
                fileInputRef={fileInputRef}
                setFundName={setFundName}
                setFundDesc={setFundDesc}
                setFundFile={setFundFile}
                onCreate={handleCreateFund}
                onUpdate={handleUpdateMine}
                onDelete={handleDeleteMine}
                startEdit={() => {
                  if (!myFund) return;
                  setFundName(myFund.name);
                  setFundDesc(myFund.description);
                  setFundFile(null);
                  setFundError('');
                  setEditingMine(true);
                }}
                cancelEdit={() => { setEditingMine(false); setFundError(''); setFundFile(null); }}
              />
            )}

            {tab === 'browse' && (
              <BrowseTab funds={funds} myStudentId={profile?.studentId} />
            )}

            {tab === 'allocate' && (
              <AllocateTab
                funds={funds}
                amounts={amounts}
                onAmountChange={handleAmountChange}
                submissionsOpen={submissionsOpen}
                submitting={submitting}
                overBudget={overBudget}
                error={allocError}
                submitted={submitted}
                studentName={profile?.studentName}
                capitalBudget={capitalBudget}
                ownFundId={myFund?.id}
                onSubmit={handleSubmitAllocation}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Tabs ------------------------------ */

function PdfLinks({ fund }: { fund: Fund }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <a
        href={fund.pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border border-slate-700"
      >
        📄 View PDF ↗
      </a>
      <a
        href={fund.pdfUrl}
        download={fund.pdfName || 'pitch.pdf'}
        className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
      >
        Download
      </a>
    </div>
  );
}

interface MyFundTabProps {
  myFund: Fund | null;
  uploadsOpen: boolean;
  editing: boolean;
  fundName: string;
  fundDesc: string;
  fundFile: File | null;
  saving: boolean;
  error: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  setFundName: (v: string) => void;
  setFundDesc: (v: string) => void;
  setFundFile: (f: File | null) => void;
  onCreate: (e: React.FormEvent) => void;
  onUpdate: (e: React.FormEvent) => void;
  onDelete: () => void;
  startEdit: () => void;
  cancelEdit: () => void;
}

function MyFundTab(props: MyFundTabProps) {
  const {
    myFund, uploadsOpen, editing, fundName, fundDesc, fundFile, saving, error,
    fileInputRef, setFundName, setFundDesc, setFundFile, onCreate, onUpdate,
    onDelete, startEdit, cancelEdit,
  } = props;

  const inputCls =
    'w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors';

  const FilePicker = ({ label }: { label: string }) => (
    <div>
      <label className="block text-slate-400 text-sm mb-1.5">{label}</label>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={e => setFundFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-white file:text-sm file:font-medium hover:file:bg-slate-600 file:cursor-pointer"
      />
      {fundFile && <p className="text-slate-500 text-xs mt-1.5 truncate">Selected: {fundFile.name}</p>}
    </div>
  );

  // No fund yet → creation form.
  if (!myFund && !editing) {
    return (
      <div>
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-white mb-1">Pitch Your Fund</h1>
          <p className="text-slate-500 text-sm">
            Upload one pitch PDF and a short description. One fund per LP.
          </p>
        </div>

        {!uploadsOpen && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-300 text-sm">
            Fund uploads aren&apos;t open yet — the instructor will enable them shortly.
          </div>
        )}

        <form onSubmit={onCreate} className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Fund Name</label>
            <input
              type="text"
              value={fundName}
              onChange={e => setFundName(e.target.value)}
              placeholder="e.g. Atlas Growth Partners I"
              className={inputCls}
              disabled={!uploadsOpen}
            />
          </div>
          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Description</label>
            <textarea
              value={fundDesc}
              onChange={e => setFundDesc(e.target.value)}
              placeholder="Strategy, stage, sector focus…"
              rows={3}
              className={`${inputCls} resize-none`}
              disabled={!uploadsOpen}
            />
          </div>
          <fieldset disabled={!uploadsOpen}><FilePicker label="Pitch PDF" /></fieldset>
          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={saving || !uploadsOpen}
            className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold rounded-xl px-4 py-3.5 transition-colors text-sm"
          >
            {saving ? 'Uploading…' : 'Submit Fund'}
          </button>
        </form>
      </div>
    );
  }

  // Editing existing fund.
  if (myFund && editing) {
    return (
      <div>
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-white mb-1">Edit Your Fund</h1>
          <p className="text-slate-500 text-sm">Update details, or replace the PDF.</p>
        </div>
        <form onSubmit={onUpdate} className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4">
          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Fund Name</label>
            <input type="text" value={fundName} onChange={e => setFundName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-slate-400 text-sm mb-1.5">Description</label>
            <textarea value={fundDesc} onChange={e => setFundDesc(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
          </div>
          <FilePicker label="Replace PDF (optional)" />
          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold rounded-xl px-4 py-3 transition-colors text-sm">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={cancelEdit} disabled={saving} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-xl px-4 py-3 transition-colors text-sm border border-slate-700">
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Existing fund, read view.
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white mb-1">Your Fund</h1>
        <p className="text-slate-500 text-sm">This is the fund other LPs will see and assess.</p>
      </div>
      <div className="bg-slate-900 rounded-2xl border border-amber-500/30 p-5">
        <div className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-400 rounded-full px-2.5 py-0.5 text-xs font-semibold mb-3">
          Your pitch
        </div>
        <h2 className="text-xl font-bold text-white leading-tight">{myFund!.name}</h2>
        {myFund!.description && (
          <TruncatedDescription text={myFund!.description} className="text-slate-400 text-sm mt-2 leading-relaxed" />
        )}
        <div className="mt-4"><PdfLinks fund={myFund!} /></div>

        <div className="mt-5 pt-4 border-t border-slate-800 flex items-center gap-2">
          {uploadsOpen ? (
            <>
              <button onClick={startEdit} className="bg-slate-800 hover:bg-slate-700 text-white rounded-lg px-3.5 py-2 text-sm font-medium transition-colors border border-slate-700">
                Edit / Replace
              </button>
              <button onClick={onDelete} disabled={saving} className="ml-auto bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors border border-red-500/20 disabled:opacity-40">
                Withdraw
              </button>
            </>
          ) : (
            <p className="text-slate-600 text-xs">Uploads are closed — your fund is locked in.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BrowseTab({ funds, myStudentId }: { funds: Fund[]; myStudentId?: string }) {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white mb-1">Browse Funds</h1>
        <p className="text-slate-500 text-sm">Open each pitch PDF to read and assess it before you allocate.</p>
      </div>

      {funds.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500 text-sm">No funds have been pitched yet.</p>
          <p className="text-slate-600 text-xs mt-1">Check back as other LPs upload theirs.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {funds.map((fund, i) => (
            <div key={fund.id} className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex-shrink-0 flex items-center justify-center text-slate-500 text-xs font-bold">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-white text-sm leading-tight">{fund.name}</h3>
                    {fund.ownerStudentId === myStudentId && (
                      <span className="bg-amber-500/10 text-amber-400 rounded-full px-2 py-0.5 text-[10px] font-semibold">YOUR FUND</span>
                    )}
                  </div>
                  <p className="text-slate-600 text-xs mt-0.5">Pitched by {fund.ownerName}</p>
                  {fund.description && (
                    <TruncatedDescription text={fund.description} className="text-slate-400 text-xs mt-1.5 leading-relaxed" />
                  )}
                </div>
              </div>
              <PdfLinks fund={fund} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface AllocateTabProps {
  funds: Fund[];
  amounts: Record<string, string>;
  onAmountChange: (id: string, v: string) => void;
  submissionsOpen: boolean;
  submitting: boolean;
  overBudget: boolean;
  error: string;
  submitted: boolean;
  studentName?: string;
  capitalBudget: number;
  ownFundId?: string;
  onSubmit: () => void;
}

function AllocateTab(props: AllocateTabProps) {
  const { funds, amounts, onAmountChange, submissionsOpen, submitting, overBudget, error, submitted, studentName, capitalBudget, ownFundId, onSubmit } = props;

  if (submitted) {
    return (
      <div className="text-center max-w-sm mx-auto py-10">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Allocation Submitted</h1>
        <p className="text-slate-400 mb-1">{studentName}, your capital has been deployed.</p>
        <p className="text-slate-500 text-sm mb-6">The instructor will reveal results shortly.</p>
        <a href="/results" className="inline-block bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors border border-slate-700">
          View Results →
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white mb-1">Allocate Your Capital</h1>
        <p className="text-slate-500 text-sm">Distribute up to ${capitalBudget.toLocaleString()}M. Any unallocated capital stays in cash.</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
      )}

      {funds.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500 text-sm">No funds to allocate to yet.</p>
          <p className="text-slate-600 text-xs mt-1">Funds appear here as LPs pitch them.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-6">
            {funds.map(fund => (
              <div key={fund.id} className="bg-slate-900 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-white text-sm leading-tight">{fund.name}</h3>
                      {fund.id === ownFundId && (
                        <span className="bg-amber-500/10 text-amber-400 rounded-full px-2 py-0.5 text-[10px] font-semibold">YOUR FUND</span>
                      )}
                    </div>
                    <p className="text-slate-600 text-xs mt-0.5">by {fund.ownerName}</p>
                    {fund.description && (
                      <TruncatedDescription text={fund.description} className="text-slate-400 text-xs mt-1 leading-relaxed" />
                    )}
                  </div>
                  <a
                    href={fund.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-amber-400 hover:text-amber-300 text-xs font-medium whitespace-nowrap"
                  >
                    PDF ↗
                  </a>
                </div>
                {fund.id === ownFundId ? (
                  <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/60 rounded-lg px-3 py-2.5">
                    <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-slate-400 text-xs">This is your own fund — you can&apos;t allocate to it.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-mono text-sm font-bold w-3">$</span>
                    <input
                      type="number"
                      min="0"
                      max={capitalBudget}
                      step="0.1"
                      value={amounts[fund.id] ?? ''}
                      onChange={e => onAmountChange(fund.id, e.target.value)}
                      placeholder="0"
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                    />
                    <span className="text-slate-500 text-sm w-5">M</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={onSubmit}
            disabled={submitting || overBudget || !submissionsOpen}
            className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold rounded-xl px-4 py-4 transition-colors text-base"
          >
            {submitting ? 'Submitting...' : 'Submit Allocation'}
          </button>
          <p className="text-center text-xs mt-3">
            {submissionsOpen
              ? <span className="text-slate-600">One submission per device. Your allocation is final.</span>
              : <span className="text-slate-500">Submissions not open yet — the instructor will enable them shortly.</span>}
          </p>
        </>
      )}
    </div>
  );
}
