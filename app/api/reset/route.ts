import { NextResponse } from 'next/server';
import { list, del } from '@vercel/blob';
import { resetAllData } from '@/lib/kv';

// Remove every uploaded fund PDF from Vercel Blob. Paginates through the store
// and deletes under our prefix. Best-effort: a Blob failure won't block the
// Redis reset.
async function purgeFundBlobs() {
  try {
    let cursor: string | undefined;
    do {
      const { blobs, cursor: next } = await list({ prefix: 'fund-pdfs/', cursor, limit: 1000 });
      if (blobs.length) {
        await del(blobs.map(b => b.url));
      }
      cursor = next;
    } while (cursor);
  } catch (err) {
    console.error('[reset blob purge]', err);
  }
}

export async function DELETE() {
  try {
    await purgeFundBlobs();
    await resetAllData();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/reset]', err);
    const message = err instanceof Error ? err.message : 'Failed to reset data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
