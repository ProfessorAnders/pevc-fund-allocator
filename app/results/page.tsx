'use client';

import { useState, useEffect } from 'react';
import type { Fund, StudentAllocation } from '@/lib/types';

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

interface FundResult {
  fund: Fund;
  total: number;
  percentage: number;
  investors: number;
  rank: number;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">🏆</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return (
    <span className="text-lg font-bold text-slate-500 w-8 text-center block">
      #{rank}
    </span>
  );
}

export default function ResultsPage() {
  const [loading, setLoading] = useState(true);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [allocations, setAllocations] = useState<StudentAllocation[]>([]);
  const [animated, setAnimated] = useState(false);

  const fetchAll = async () => {
    try {
      const [sr, fr, ar] = await Promise.all([
        fetch('/api/state'),
        fetch('/api/funds'),
        fetch('/api/allocations'),
      ]);
      const [s, f, a] = await Promise.all([sr.json(), fr.json(), ar.json()]);
      setResultsVisible(s.resultsVisible);
      setFunds(f);
      setAllocations(a);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchAll().then(() => setLoading(false));

    const interval = setInterval(async () => {
      const res = await fetch('/api/state').catch(() => null);
      if (!res) return;
      const { resultsVisible: vis } = await res.json();
      if (vis) {
        await fetchAll();
        setAnimated(false);
        setTimeout(() => setAnimated(true), 50);
      }
      setResultsVisible(vis);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (resultsVisible && !loading) {
      setTimeout(() => setAnimated(true), 100);
    }
  }, [resultsVisible, loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (!resultsVisible) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-6 text-3xl">
            🔒
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Results Not Yet Available</h1>
          <p className="text-slate-400">The instructor will reveal the leaderboard shortly.</p>
          <p className="text-slate-600 text-xs mt-2">This page refreshes automatically.</p>
        </div>
      </div>
    );
  }

  // Compute per-fund totals first, then derive grandTotal from them so the
  // header figure always matches the sum of the displayed bars (allocations to
  // deleted funds are excluded from both).
  const fundTotals = funds.map(fund => {
    const total = allocations.reduce((s, alloc) => {
      const fa = alloc.allocations.find(a => a.fundId === fund.id);
      return s + (fa?.amount ?? 0);
    }, 0);
    const investors = allocations.filter(alloc =>
      alloc.allocations.some(a => a.fundId === fund.id && a.amount > 0)
    ).length;
    return { fund, total, investors };
  });

  const grandTotal = fundTotals.reduce((s, r) => s + r.total, 0);

  const fundResults: FundResult[] = fundTotals
    .map(r => ({
      ...r,
      percentage: grandTotal > 0 ? (r.total / grandTotal) * 100 : 0,
      rank: 0,
    }))
    .sort((a, b) => b.total - a.total)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const maxTotal = fundResults[0]?.total || 1;

  return (
    <div className="min-h-screen py-10 px-4 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-amber-400 text-xs font-semibold tracking-widest uppercase mb-5">
            PE / VC Seminar — Final Results
          </div>
          <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
            Fund Leaderboard
          </h1>
          <div className="flex items-center justify-center gap-2 text-slate-400 text-sm flex-wrap">
            <span>
              <span className="text-white font-semibold">{allocations.length}</span> LPs participated
            </span>
            <span className="text-slate-700">·</span>
            <span>
              <span className="text-amber-400 font-semibold">${grandTotal.toFixed(1)}M</span> total deployed
            </span>
            <span className="text-slate-700">·</span>
            <span>
              <span className="text-white font-semibold">{funds.length}</span> funds
            </span>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="space-y-3">
          {fundResults.map((result, idx) => (
            <div
              key={result.fund.id}
              className={`relative rounded-2xl border overflow-hidden transition-all duration-700 ${
                result.rank === 1
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-slate-800 bg-slate-900'
              }`}
              style={{
                opacity: animated ? 1 : 0,
                transform: animated ? 'none' : 'translateY(16px)',
                transition: `opacity 0.5s ease ${idx * 0.08}s, transform 0.5s ease ${idx * 0.08}s`,
              }}
            >
              {/* Animated fill bar */}
              <div
                className={`absolute inset-y-0 left-0 ${
                  result.rank === 1 ? 'bg-amber-500/8' : 'bg-slate-700/25'
                }`}
                style={{
                  width: animated ? `${(result.total / maxTotal) * 100}%` : '0%',
                  transition: `width 1.2s cubic-bezier(0.4,0,0.2,1) ${idx * 0.1 + 0.3}s`,
                }}
              />

              <div className="relative flex items-center gap-4 p-5">
                {/* Rank */}
                <div className="w-9 text-center flex-shrink-0">
                  <RankBadge rank={result.rank} />
                </div>

                {/* Name + description */}
                <div className="flex-1 min-w-0">
                  <h2 className={`font-bold leading-tight truncate ${
                    result.rank === 1 ? 'text-xl text-amber-50' : 'text-lg text-white'
                  }`}>
                    {result.fund.name}
                  </h2>
                  {result.fund.description && (
                    <TruncatedDescription
                      text={result.fund.description}
                      className="text-slate-500 text-xs mt-0.5"
                    />
                  )}
                  <p className="text-slate-600 text-xs mt-1">
                    {result.fund.ownerName && <>Pitched by {result.fund.ownerName} · </>}
                    {result.investors} investor{result.investors !== 1 ? 's' : ''}
                    {result.fund.pdfUrl && (
                      <>
                        {' · '}
                        <a
                          href={result.fund.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-400 hover:text-amber-300 transition-colors"
                        >
                          PDF ↗
                        </a>
                      </>
                    )}
                  </p>
                </div>

                {/* Amount + pct */}
                <div className="text-right flex-shrink-0">
                  <div className={`font-bold font-mono leading-tight ${
                    result.rank === 1 ? 'text-2xl text-amber-400' : 'text-xl text-white'
                  }`}>
                    ${result.total.toFixed(1)}M
                  </div>
                  <div className="text-slate-400 text-sm mt-0.5">
                    {result.percentage.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-10 text-slate-700 text-xs">
          PEVC Fund Allocator · Results auto-refresh every 5s
        </div>
      </div>
    </div>
  );
}
