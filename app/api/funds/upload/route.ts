import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { getUploadsOpen, getFundByOwner } from '@/lib/kv';

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB ceiling per pitch deck

// Issues a short-lived token so the browser can upload a PDF straight to Vercel
// Blob (bypassing the 4.5 MB serverless body limit). We authorise here: uploads
// must be open, the file must be a PDF, and a student creating a fund must not
// already have one.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const open = await getUploadsOpen();
        if (!open) throw new Error('Fund uploads are not open yet.');

        let studentId = '';
        let mode: 'create' | 'replace' = 'create';
        if (clientPayload) {
          try {
            const parsed = JSON.parse(clientPayload);
            studentId = parsed.studentId || '';
            mode = parsed.mode === 'replace' ? 'replace' : 'create';
          } catch {
            // ignore malformed payloads — treated as anonymous create below
          }
        }
        if (!studentId) throw new Error('Missing student profile.');

        // Block a second upload when creating (one fund per student). Replacing
        // an existing fund is allowed.
        if (mode === 'create') {
          const existing = await getFundByOwner(studentId);
          if (existing) throw new Error('You have already pitched a fund.');
        }

        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: MAX_PDF_BYTES,
          tokenPayload: JSON.stringify({ studentId }),
        };
      },
      // Fires via Vercel webhook after the upload completes. We persist the fund
      // record from the client instead (which also works on localhost), so this
      // is intentionally a no-op.
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload authorization failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
