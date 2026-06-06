'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Fund, StudentAllocation } from '@/lib/types';

const ADMIN_PASSWORD = 'pevc2026';

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [funds, setFunds] = useState<Fund[]>([]);
  const [allocations, setAllocations] = useState<StudentAllocation[]>([]);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [uploadsOpen, setUploadsOpen] = useState(false);
  const [capitalBudget, setCapitalBudget] = useState(100);
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  interface RegisteredStudent {
    fingerprint: string;
    studentId: string;
    studentName: string;
    hasSubmitted: boolean;
  }
  const [students, setStudents] = useState<RegisteredStudent[]>([]);
  const [deletingStudent, setDeletingStudent] = useState<string | null>(null);
  const [clearingStudents, setClearingStudents] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refreshTimer = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [fr, ar, sr, str] = await Promise.all([
        fetch('/api/funds'),
        fetch('/api/allocations'),
        fetch('/api/state'),
        fetch('/api/students'),
      ]);
      const [f, a, s, st] = await Promise.all([fr.json(), ar.json(), sr.json(), str.json()]);
      setFunds(Array.isArray(f) ? f : []);
      setAllocations(Array.isArray(a) ? a : []);
      setResultsVisible(Boolean(s?.resultsVisible));
      setSubmissionsOpen(Boolean(s?.submissionsOpen));
      setUploadsOpen(Boolean(s?.uploadsOpen));
      if (typeof s?.capitalBudget === 'number') {
        setCapitalBudget(s.capitalBudget);
        setBudgetInput(prev => (prev === '' ? String(s.capitalBudget) : prev));
      }
      setStudents(Array.isArray(st) ? st : []);
      setLastRefresh(new Date());
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem('pevc_admin_auth') === ADMIN_PASSWORD) {
      setAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    fetchData();
    refreshTimer.current = setInterval(fetchData, 5000);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [authenticated, fetchData]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      localStorage.setItem('pevc_admin_auth', ADMIN_PASSWORD);
      setAuthenticated(true);
    } else {
      setPasswordError('Incorrect password');
    }
  };

  const handleDeleteFund = async (id: string) => {
    if (!confirm('Delete this fund? This removes the LP\u2019s pitch and its PDF. This cannot be undone.')) return;
    await fetch(`/api/funds/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  const handleReset = async () => {
    if (!confirm('Reset ALL data? This deletes every allocation, LP profile, fund, and uploaded PDF. This cannot be undone.')) return;
    try {
      const res = await fetch('/api/reset', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Reset failed');
        return;
      }
      await fetchData();
    } catch {
      alert('Network error — reset failed');
    }
  };

  const handleDeleteStudent = async (fingerprint: string, studentId: string) => {
    if (!confirm('Remove this LP profile? Their fund and allocation are deleted, and they can re-register from their device.')) return;
    setDeletingStudent(fingerprint);
    try {
      await fetch('/api/students', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint, studentId }),
      });
      await fetchData();
    } finally {
      setDeletingStudent(null);
    }
  };

  const handleClearStudents = async () => {
    if (!confirm('Remove ALL LP profiles, their funds, and their allocations? Students will be able to re-register.')) return;
    setClearingStudents(true);
    try {
      await fetch('/api/students', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true }),
      });
      await fetchData();
    } finally {
      setClearingStudents(false);
    }
  };

  const handleSaveBudget = async () => {
    const n = Number(budgetInput);
    if (!Number.isFinite(n) || n <= 0) {
      alert('Enter a positive number for the capital budget.');
      return;
    }
    setSavingBudget(true);
    try {
      const res = await fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capitalBudget: n }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Could not update the budget.');
        return;
      }
      setCapitalBudget(n);
    } finally {
      setSavingBudget(false);
    }
  };

  const handleToggleUploads = async () => {
    const next = !uploadsOpen;
    await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadsOpen: next }),
    });
    setUploadsOpen(next);
  };

  const handleToggleSubmissions = async () => {
    const next = !submissionsOpen;
    await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionsOpen: next }),
    });
    setSubmissionsOpen(next);
  };

  const handleToggleResults = async () => {
    const next = !resultsVisible;
    if (next && !confirm('Reveal results to all students? They will be able to see the leaderboard.')) return;
    await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resultsVisible: next }),
    });
    setResultsVisible(next);
  };

  const totalCapital = allocations.reduce((s, a) => s + a.totalAllocated, 0);
  const avgAllocation = allocations.length > 0 ? totalCapital / allocations.length : 0;
  const fundByOwner = new Map(funds.map(f => [f.ownerStudentId, f]));

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-amber-400 text-xs tracking-widest uppercase font-semibold mb-2">
              PEVC Fund Allocator
            </div>
            <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
          </div>
          <form onSubmit={handleLogin} className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">Password</label>
              <input
                type="password"
                value={passwordInput}
                onChange={e => { setPasswordInput(e.target.value); setPasswordError(''); }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                autoFocus
              />
              {passwordError && <p className="text-red-400 text-xs mt-1.5">{passwordError}</p>}
            </div>
            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl px-4 py-3 transition-colors text-sm"
            >
              Enter
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Topbar */}
      <div className="border-b border-slate-800 bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-amber-400 text-xs font-semibold tracking-widest uppercase">PEVC</span>
            <span className="text-slate-700">|</span>
            <span className="text-white font-semibold text-sm">Admin Panel</span>
          </div>
          <div className="flex items-center gap-4">
            {lastRefresh && (
              <span className="text-slate-600 text-xs hidden sm:block">
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <a href="/results" target="_blank" className="text-slate-400 hover:text-white text-xs transition-colors">
              Results page ↗
            </a>
            <button onClick={handleReset} className="text-red-500 hover:text-red-400 text-xs transition-colors">
              Reset all data
            </button>
            <button
              onClick={() => { localStorage.removeItem('pevc_admin_auth'); setAuthenticated(false); }}
              className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Stats + controls */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Funds</div>
            <div className="text-3xl font-bold text-white">{funds.length}</div>
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Submissions</div>
            <div className="text-3xl font-bold text-white">{allocations.length}</div>
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Capital</div>
            <div className="text-3xl font-bold text-amber-400">${totalCapital.toFixed(0)}M</div>
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="text-slate-500 text-xs uppercase tracking-wider mb-2">Uploads Gate</div>
            <button
              onClick={handleToggleUploads}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                uploadsOpen
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30'
                  : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              }`}
            >
              {uploadsOpen ? '● Open — Click to Close' : 'Open Uploads →'}
            </button>
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="text-slate-500 text-xs uppercase tracking-wider mb-2">Submissions Gate</div>
            <button
              onClick={handleToggleSubmissions}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                submissionsOpen
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30'
                  : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              }`}
            >
              {submissionsOpen ? '● Open — Click to Close' : 'Open Submissions →'}
            </button>
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="text-slate-500 text-xs uppercase tracking-wider mb-2">Results Status</div>
            <button
              onClick={handleToggleResults}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                resultsVisible
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30'
                  : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              }`}
            >
              {resultsVisible ? '● Live — Click to Hide' : 'Reveal Results →'}
            </button>
          </div>
        </div>

        {/* Capital budget per LP */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="text-white text-sm font-semibold">Capital per LP</div>
            <div className="text-slate-500 text-xs mt-0.5">
              How much each student deploys across the funds. Currently{' '}
              <span className="text-amber-400 font-mono">${capitalBudget.toLocaleString()}M</span>.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-sm">$</span>
            <input
              type="number"
              min="1"
              step="1"
              value={budgetInput}
              onChange={e => setBudgetInput(e.target.value)}
              className="w-28 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors"
            />
            <span className="text-slate-500 text-sm">M</span>
            <button
              onClick={handleSaveBudget}
              disabled={savingBudget || budgetInput === '' || Number(budgetInput) === capitalBudget}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
            >
              {savingBudget ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Funds (pitched by LPs) */}
          <div>
            <h2 className="text-base font-semibold text-white mb-1">Funds</h2>
            <p className="text-slate-500 text-xs mb-3">
              Pitched by students from their own devices. You can review each PDF or remove a fund.
            </p>

            <div className="space-y-2">
              {funds.length === 0 && (
                <p className="text-slate-600 text-sm text-center py-4">
                  No funds yet. Open the uploads gate so LPs can pitch.
                </p>
              )}
              {funds.map(fund => (
                <div key={fund.id} className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex-shrink-0 flex items-center justify-center text-slate-600 text-xs">
                      #{fund.order + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-semibold leading-tight">{fund.name}</div>
                      <div className="text-slate-500 text-xs">Pitched by {fund.ownerName}</div>
                      <div className="text-slate-500 text-xs mt-0.5 line-clamp-2">{fund.description || 'No description'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {fund.pdfUrl && (
                      <a
                        href={fund.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors border border-slate-700"
                      >
                        View PDF ↗
                      </a>
                    )}
                    <button
                      onClick={() => handleDeleteFund(fund.id)}
                      className="ml-auto bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors border border-red-500/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live submissions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-white">Live Submissions</h2>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-500 text-xs">Auto-refresh 5s</span>
              </div>
            </div>

            <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {allocations.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 text-sm">Waiting for students to submit...</p>
                </div>
              ) : (
                [...allocations]
                  .sort((a, b) => b.submittedAt - a.submittedAt)
                  .map(alloc => (
                    <div key={alloc.studentId} className="bg-slate-900 rounded-xl border border-slate-800 p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white text-sm font-semibold">{alloc.studentName}</span>
                        <span className="text-amber-400 font-mono text-sm">${alloc.totalAllocated.toFixed(1)}M</span>
                      </div>
                      <div className="space-y-1">
                        {alloc.allocations
                          .filter(a => a.amount > 0)
                          .sort((a, b) => b.amount - a.amount)
                          .map(a => {
                            const fund = funds.find(f => f.id === a.fundId);
                            return (
                              <div key={a.fundId} className="flex items-center justify-between text-xs">
                                <span className="text-slate-400 truncate">{fund?.name ?? 'Unknown'}</span>
                                <span className="text-slate-300 font-mono ml-2 flex-shrink-0">
                                  ${a.amount.toFixed(1)}M
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        {/* Student management */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white">LP Profiles</h2>
            <button
              onClick={handleClearStudents}
              disabled={clearingStudents || students.length === 0}
              className="text-red-500 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
            >
              {clearingStudents ? 'Clearing…' : 'Clear all students'}
            </button>
          </div>

          {students.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 text-sm">No students registered yet.</p>
            </div>
          ) : (
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left text-slate-500 text-xs uppercase tracking-wider px-4 py-2.5 font-medium">Name</th>
                    <th className="text-left text-slate-500 text-xs uppercase tracking-wider px-4 py-2.5 font-medium hidden md:table-cell">Fund</th>
                    <th className="text-left text-slate-500 text-xs uppercase tracking-wider px-4 py-2.5 font-medium hidden sm:table-cell">Device ID</th>
                    <th className="text-left text-slate-500 text-xs uppercase tracking-wider px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {[...students]
                    .sort((a, b) => a.studentName.localeCompare(b.studentName))
                    .map(student => {
                      const fund = fundByOwner.get(student.studentId);
                      return (
                        <tr key={student.fingerprint}>
                          <td className="px-4 py-3 text-white font-medium truncate max-w-[140px]">
                            {student.studentName}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {fund ? (
                              <span className="text-slate-300 truncate">{fund.name}</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 font-mono text-xs hidden sm:table-cell">
                            {student.fingerprint.slice(0, 10)}…
                          </td>
                          <td className="px-4 py-3">
                            {student.hasSubmitted ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                Submitted
                              </span>
                            ) : (
                              <span className="text-slate-500 text-xs">Pending</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDeleteStudent(student.fingerprint, student.studentId)}
                              disabled={deletingStudent === student.fingerprint}
                              className="text-red-500 hover:text-red-400 disabled:opacity-40 text-xs transition-colors"
                            >
                              {deletingStudent === student.fingerprint ? 'Removing…' : 'Remove'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
