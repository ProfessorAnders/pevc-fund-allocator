import { NextRequest, NextResponse } from 'next/server';
import {
  getResultsVisible,
  setResultsVisible,
  getSubmissionsOpen,
  setSubmissionsOpen,
  getUploadsOpen,
  setUploadsOpen,
  getCapitalBudget,
  setCapitalBudget,
} from '@/lib/kv';

export async function GET() {
  try {
    const [resultsVisible, submissionsOpen, uploadsOpen, capitalBudget] = await Promise.all([
      getResultsVisible(),
      getSubmissionsOpen(),
      getUploadsOpen(),
      getCapitalBudget(),
    ]);
    return NextResponse.json({ resultsVisible, submissionsOpen, uploadsOpen, capitalBudget });
  } catch (err) {
    console.error('[GET /api/state]', err);
    return NextResponse.json(
      { resultsVisible: false, submissionsOpen: false, uploadsOpen: false, capitalBudget: 100 },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    let budgetUpdate: Promise<void> = Promise.resolve();
    if ('capitalBudget' in body) {
      const n = Number(body.capitalBudget);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ error: 'Capital budget must be a positive number.' }, { status: 400 });
      }
      // Clamp to a sane range to avoid accidental extremes.
      const clamped = Math.min(Math.max(n, 1), 1_000_000);
      budgetUpdate = setCapitalBudget(clamped);
    }

    await Promise.all([
      'resultsVisible' in body ? setResultsVisible(Boolean(body.resultsVisible)) : Promise.resolve(),
      'submissionsOpen' in body ? setSubmissionsOpen(Boolean(body.submissionsOpen)) : Promise.resolve(),
      'uploadsOpen' in body ? setUploadsOpen(Boolean(body.uploadsOpen)) : Promise.resolve(),
      budgetUpdate,
    ]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[PUT /api/state]', err);
    const message = err instanceof Error ? err.message : 'Failed to update state';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
