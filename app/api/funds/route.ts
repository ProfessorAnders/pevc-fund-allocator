import { NextRequest, NextResponse } from 'next/server';
import { getFunds, saveFunds, getUploadsOpen } from '@/lib/kv';
import type { Fund } from '@/lib/types';

export async function GET() {
  try {
    const funds = await getFunds();
    return NextResponse.json(funds.sort((a, b) => a.order - b.order));
  } catch (err) {
    console.error('[GET /api/funds]', err);
    return NextResponse.json([], { status: 500 });
  }
}

// Funds are now created by students ("LPs"), each pitching exactly one fund with
// a name, description, and an uploaded PDF (already stored in Vercel Blob — the
// client sends back the resulting pdfUrl).
export async function POST(request: NextRequest) {
  try {
    const open = await getUploadsOpen();
    if (!open) {
      return NextResponse.json({ error: 'Fund uploads are not open yet.' }, { status: 403 });
    }

    const body = await request.json();
    const name: string = body.name?.trim() || '';
    const description: string = body.description?.trim() || '';
    const ownerStudentId: string = body.studentId || '';
    const ownerName: string = body.studentName?.trim() || '';
    const pdfUrl: string = body.pdfUrl || '';
    const pdfName: string = body.pdfName?.trim() || '';

    if (!name || !ownerStudentId || !ownerName || !pdfUrl) {
      return NextResponse.json(
        { error: 'A fund name, your profile, and a PDF are all required.' },
        { status: 400 }
      );
    }

    const funds = await getFunds();

    // One fund per student.
    if (funds.some(f => f.ownerStudentId === ownerStudentId)) {
      return NextResponse.json(
        { error: 'You have already pitched a fund. Edit or replace your existing one instead.' },
        { status: 409 }
      );
    }

    const newFund: Fund = {
      id: crypto.randomUUID(),
      name,
      description,
      order: funds.length,
      createdAt: Date.now(),
      ownerStudentId,
      ownerName,
      pdfUrl,
      pdfName: pdfName || 'pitch.pdf',
    };

    await saveFunds([...funds, newFund]);
    return NextResponse.json(newFund, { status: 201 });
  } catch (err) {
    console.error('[POST /api/funds]', err);
    const message = err instanceof Error ? err.message : 'Failed to create fund';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
