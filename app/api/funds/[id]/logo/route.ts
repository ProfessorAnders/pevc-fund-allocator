import { NextRequest, NextResponse } from 'next/server';
import { getFundLogo, saveFundLogo, getFunds, saveFunds } from '@/lib/kv';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const logo = await getFundLogo(params.id);
    if (!logo) {
      return NextResponse.json({ error: 'No logo' }, { status: 404 });
    }

    const commaIdx = logo.indexOf(',');
    const header = logo.substring(0, commaIdx);
    const data = logo.substring(commaIdx + 1);
    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch?.[1] ?? 'image/png';
    const buffer = Buffer.from(data, 'base64');

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch logo' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { logoBase64 } = await request.json();
    if (!logoBase64) {
      return NextResponse.json({ error: 'No logo data' }, { status: 400 });
    }

    await saveFundLogo(params.id, logoBase64);

    const funds = await getFunds();
    const idx = funds.findIndex(f => f.id === params.id);
    if (idx !== -1) {
      funds[idx].hasLogo = true;
      await saveFunds(funds);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save logo' }, { status: 500 });
  }
}
