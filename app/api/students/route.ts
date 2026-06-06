import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { getAllStudents, deleteStudent, clearAllStudents } from '@/lib/kv';

// Best-effort blob cleanup for funds removed alongside their owners.
async function tryDeleteBlobs(urls: string[]) {
  if (!urls.length) return;
  try {
    await del(urls);
  } catch (err) {
    console.error('[blob del]', err);
  }
}

export async function GET() {
  try {
    const students = await getAllStudents();
    return NextResponse.json(students);
  } catch (err) {
    console.error('[GET /api/students]', err);
    return NextResponse.json([], { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    if (body.clearAll) {
      const { removedPdfUrls } = await clearAllStudents();
      await tryDeleteBlobs(removedPdfUrls);
      return NextResponse.json({ success: true });
    }

    const { fingerprint, studentId } = body;
    if (!fingerprint || !studentId) {
      return NextResponse.json({ error: 'fingerprint and studentId required' }, { status: 400 });
    }

    const { removedPdfUrls } = await deleteStudent(fingerprint, studentId);
    await tryDeleteBlobs(removedPdfUrls);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/students]', err);
    const message = err instanceof Error ? err.message : 'Failed to delete student';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
