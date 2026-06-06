import { NextRequest, NextResponse } from 'next/server';
import { isStudentValid } from '@/lib/kv';

export async function GET(
  _request: NextRequest,
  { params }: { params: { studentId: string } }
) {
  try {
    const valid = await isStudentValid(params.studentId);
    return NextResponse.json({ valid });
  } catch (err) {
    console.error('[GET /api/students/[studentId]/validate]', err);
    // Fail open — don't kick out a student on a transient error.
    return NextResponse.json({ valid: true }, { status: 500 });
  }
}
