import { Redis } from '@upstash/redis';
import type { Fund, StudentAllocation } from './types';

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;

if (!url) {
  throw new Error(
    'Missing env var KV_REST_API_URL — add it to .env.local (see .env.local.example)'
  );
}
if (!token) {
  throw new Error(
    'Missing env var KV_REST_API_TOKEN — add it to .env.local (see .env.local.example)'
  );
}

const kv = new Redis({ url, token });

const FUNDS_KEY = 'pevc:funds';
const STUDENT_IDS_KEY = 'pevc:student_ids';
const RESULTS_VISIBLE_KEY = 'pevc:results_visible';
const SUBMISSIONS_OPEN_KEY = 'pevc:submissions_open';
const UPLOADS_OPEN_KEY = 'pevc:uploads_open';
const CAPITAL_BUDGET_KEY = 'pevc:capital_budget';

export async function getFunds(): Promise<Fund[]> {
  const funds = await kv.get<Fund[]>(FUNDS_KEY);
  return funds ?? [];
}

export async function saveFunds(funds: Fund[]): Promise<void> {
  await kv.set(FUNDS_KEY, funds);
}

/** Returns the fund pitched by a given student, or null if they have none yet. */
export async function getFundByOwner(studentId: string): Promise<Fund | null> {
  const funds = await getFunds();
  return funds.find(f => f.ownerStudentId === studentId) ?? null;
}

export async function getStudentAllocation(studentId: string): Promise<StudentAllocation | null> {
  return kv.get<StudentAllocation>(`pevc:allocation:${studentId}`);
}

export async function saveStudentAllocation(allocation: StudentAllocation): Promise<void> {
  await kv.set(`pevc:allocation:${allocation.studentId}`, allocation);
  const ids = (await kv.get<string[]>(STUDENT_IDS_KEY)) ?? [];
  if (!ids.includes(allocation.studentId)) {
    await kv.set(STUDENT_IDS_KEY, [...ids, allocation.studentId]);
  }
}

export async function getAllAllocations(): Promise<StudentAllocation[]> {
  const ids = (await kv.get<string[]>(STUDENT_IDS_KEY)) ?? [];
  if (ids.length === 0) return [];
  const results = await Promise.all(
    ids.map(id => kv.get<StudentAllocation>(`pevc:allocation:${id}`))
  );
  return results.filter(Boolean) as StudentAllocation[];
}

export async function getResultsVisible(): Promise<boolean> {
  const val = await kv.get<boolean>(RESULTS_VISIBLE_KEY);
  return val ?? false;
}

export async function setResultsVisible(visible: boolean): Promise<void> {
  await kv.set(RESULTS_VISIBLE_KEY, visible);
}

export async function getSubmissionsOpen(): Promise<boolean> {
  const val = await kv.get<boolean>(SUBMISSIONS_OPEN_KEY);
  return val ?? false;
}

export async function setSubmissionsOpen(open: boolean): Promise<void> {
  await kv.set(SUBMISSIONS_OPEN_KEY, open);
}

export async function getUploadsOpen(): Promise<boolean> {
  const val = await kv.get<boolean>(UPLOADS_OPEN_KEY);
  return val ?? false;
}

export async function setUploadsOpen(open: boolean): Promise<void> {
  await kv.set(UPLOADS_OPEN_KEY, open);
}

/** Per-LP capital budget in $M. Defaults to 100. */
export async function getCapitalBudget(): Promise<number> {
  const val = await kv.get<number>(CAPITAL_BUDGET_KEY);
  return typeof val === 'number' && val > 0 ? val : 100;
}

export async function setCapitalBudget(amount: number): Promise<void> {
  await kv.set(CAPITAL_BUDGET_KEY, amount);
}

export async function saveFundLogo(fundId: string, logoBase64: string): Promise<void> {
  await kv.set(`pevc:logo:${fundId}`, logoBase64);
}

export async function getFundLogo(fundId: string): Promise<string | null> {
  return kv.get<string>(`pevc:logo:${fundId}`);
}

export async function deleteFundLogo(fundId: string): Promise<void> {
  await kv.del(`pevc:logo:${fundId}`);
}

export async function getFingerprintRecord(fp: string): Promise<{ studentId: string; studentName: string } | null> {
  return kv.get<{ studentId: string; studentName: string }>(`pevc:fingerprint:${fp}`);
}

export async function saveFingerprint(fp: string, studentId: string, studentName: string): Promise<void> {
  await Promise.all([
    kv.set(`pevc:fingerprint:${fp}`, { studentId, studentName }),
    kv.set(`pevc:student:${studentId}`, true),
  ]);
}

export async function isStudentValid(studentId: string): Promise<boolean> {
  const val = await kv.get(`pevc:student:${studentId}`);
  return val !== null;
}

export async function getAllStudents(): Promise<Array<{
  fingerprint: string;
  studentId: string;
  studentName: string;
  hasSubmitted: boolean;
}>> {
  const keys = await kv.keys('pevc:fingerprint:*');
  if (keys.length === 0) return [];

  const submittedIds = (await kv.get<string[]>(STUDENT_IDS_KEY)) ?? [];
  const records = await Promise.all(
    keys.map(key => kv.get<{ studentId: string; studentName: string }>(key))
  );

  return keys
    .map((key, i) => {
      const record = records[i];
      if (!record) return null;
      const fingerprint = key.replace('pevc:fingerprint:', '');
      return {
        fingerprint,
        studentId: record.studentId,
        studentName: record.studentName,
        hasSubmitted: submittedIds.includes(record.studentId),
      };
    })
    .filter(Boolean) as Array<{ fingerprint: string; studentId: string; studentName: string; hasSubmitted: boolean }>;
}

export async function deleteStudent(fingerprint: string, studentId: string): Promise<{ removedPdfUrls: string[] }> {
  // Remove any fund this student pitched, capturing its PDF url for blob cleanup.
  const funds = await getFunds();
  const removedPdfUrls = funds
    .filter(f => f.ownerStudentId === studentId && f.pdfUrl)
    .map(f => f.pdfUrl);
  const remainingFunds = funds.filter(f => f.ownerStudentId !== studentId);
  if (remainingFunds.length !== funds.length) {
    await saveFunds(remainingFunds);
  }

  await Promise.all([
    kv.del(`pevc:fingerprint:${fingerprint}`),
    kv.del(`pevc:allocation:${studentId}`),
    kv.del(`pevc:student:${studentId}`),
  ]);
  const ids = (await kv.get<string[]>(STUDENT_IDS_KEY)) ?? [];
  await kv.set(STUDENT_IDS_KEY, ids.filter(id => id !== studentId));

  return { removedPdfUrls };
}

export async function clearAllStudents(): Promise<{ removedPdfUrls: string[] }> {
  // In the student-pitch model every fund belongs to a student, so clearing all
  // students also clears all funds. Capture PDF urls first for blob cleanup.
  const funds = await getFunds();
  const removedPdfUrls = funds.filter(f => f.pdfUrl).map(f => f.pdfUrl);

  const [fingerprintKeys, allocationKeys, studentKeys] = await Promise.all([
    kv.keys('pevc:fingerprint:*'),
    kv.keys('pevc:allocation:*'),
    kv.keys('pevc:student:*'),
  ]);
  const toDelete = [...fingerprintKeys, ...allocationKeys, ...studentKeys, STUDENT_IDS_KEY, FUNDS_KEY];
  if (toDelete.length > 0) {
    await kv.del(...(toDelete as [string, ...string[]]));
  }

  return { removedPdfUrls };
}

export async function resetAllData(): Promise<void> {
  const keys = await kv.keys('pevc:*');
  if (keys.length > 0) {
    await kv.del(...(keys as [string, ...string[]]));
  }
}
