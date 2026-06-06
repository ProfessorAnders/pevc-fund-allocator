import { NextRequest, NextResponse } from 'next/server';
import { getStudentAllocation, saveStudentAllocation, getAllAllocations, getSubmissionsOpen, getCapitalBudget, getFundByOwner } from '@/lib/kv';
import type { StudentAllocation } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const studentId = new URL(request.url).searchParams.get('studentId');

    if (studentId) {
      const allocation = await getStudentAllocation(studentId);
      return NextResponse.json(allocation ?? null);
    }

    const all = await getAllAllocations();
    return NextResponse.json(all);
  } catch (err) {
    console.error('[GET /api/allocations]', err);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const open = await getSubmissionsOpen();
    if (!open) {
      return NextResponse.json({ error: 'Submissions are not open yet.' }, { status: 403 });
    }

    const { studentId, studentName, allocations } = await request.json();

    if (!studentId || !studentName || !Array.isArray(allocations)) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    // Students cannot allocate to their own fund.
    const ownFund = await getFundByOwner(studentId);
    if (ownFund && allocations.some((a: { fundId: string; amount: number }) => a.fundId === ownFund.id && Number(a.amount) > 0)) {
      return NextResponse.json({ error: 'You cannot allocate to your own fund.' }, { status: 400 });
    }

    const totalAllocated: number = allocations.reduce(
      (sum: number, a: { amount: number }) => sum + (Number(a.amount) || 0),
      0
    );

    const budget = await getCapitalBudget();
    if (totalAllocated > budget) {
      return NextResponse.json({ error: `Total exceeds $${budget}M` }, { status: 400 });
    }

    const record: StudentAllocation = {
      studentId,
      studentName,
      allocations,
      totalAllocated,
      submittedAt: Date.now(),
    };

    await saveStudentAllocation(record);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/allocations]', err);
    const message = err instanceof Error ? err.message : 'Failed to save allocation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
