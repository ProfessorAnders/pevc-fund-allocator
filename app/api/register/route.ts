import { NextRequest, NextResponse } from 'next/server';
import { getFingerprintRecord, saveFingerprint } from '@/lib/kv';

export async function POST(request: NextRequest) {
  try {
    const { name, fingerprint } = await request.json();

    if (!name?.trim() || !fingerprint) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    const existing = await getFingerprintRecord(fingerprint);
    if (existing) {
      return NextResponse.json(
        { error: 'An LP profile already exists from this device.' },
        { status: 409 }
      );
    }

    const studentId = crypto.randomUUID();
    await saveFingerprint(fingerprint, studentId, name.trim());

    return NextResponse.json({ studentId, studentName: name.trim() });
  } catch (err) {
    console.error('[POST /api/register]', err);
    const message = err instanceof Error ? err.message : 'Registration failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
