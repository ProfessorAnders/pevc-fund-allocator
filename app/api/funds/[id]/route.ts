import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { getFunds, saveFunds, deleteFundLogo } from '@/lib/kv';

// Best-effort blob deletion — never block the request if cleanup fails.
async function tryDeleteBlob(url?: string) {
  if (!url) return;
  try {
    await del(url);
  } catch (err) {
    console.error('[blob del]', err);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const funds = await getFunds();
    const idx = funds.findIndex(f => f.id === params.id);

    if (idx === -1) {
      return NextResponse.json({ error: 'Fund not found' }, { status: 404 });
    }

    // A student may only edit their own fund. Admin calls omit studentId.
    if (body.studentId && body.studentId !== funds[idx].ownerStudentId) {
      return NextResponse.json({ error: 'You can only edit your own fund.' }, { status: 403 });
    }

    const oldPdfUrl = funds[idx].pdfUrl;
    const replacingPdf = typeof body.pdfUrl === 'string' && body.pdfUrl && body.pdfUrl !== oldPdfUrl;

    funds[idx] = {
      ...funds[idx],
      name: body.name?.trim() || funds[idx].name,
      description: typeof body.description === 'string' ? body.description.trim() : funds[idx].description,
      pdfUrl: replacingPdf ? body.pdfUrl : funds[idx].pdfUrl,
      pdfName: replacingPdf ? (body.pdfName?.trim() || 'pitch.pdf') : funds[idx].pdfName,
    };

    await saveFunds(funds);

    // Once the new PDF is recorded, remove the superseded blob.
    if (replacingPdf) await tryDeleteBlob(oldPdfUrl);

    return NextResponse.json(funds[idx]);
  } catch (err) {
    console.error('[PUT /api/funds/[id]]', err);
    return NextResponse.json({ error: 'Failed to update fund' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const funds = await getFunds();
    const target = funds.find(f => f.id === params.id);

    // A student may only delete their own fund. Admin calls omit studentId.
    if (body?.studentId && target && body.studentId !== target.ownerStudentId) {
      return NextResponse.json({ error: 'You can only delete your own fund.' }, { status: 403 });
    }

    await saveFunds(funds.filter(f => f.id !== params.id));
    await tryDeleteBlob(target?.pdfUrl);
    await deleteFundLogo(params.id); // legacy cleanup; no-op for new funds
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/funds/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete fund' }, { status: 500 });
  }
}
