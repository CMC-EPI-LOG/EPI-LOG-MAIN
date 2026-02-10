import { NextResponse } from 'next/server';
import { dbConnect } from '@/lib/mongoose';
import { UserLog } from '@/models/UserLog';

export const runtime = 'nodejs';

type LogBody = {
  session_id?: string;
  source?: string;
  event_name?: string;
  metadata?: Record<string, unknown>;
};

export async function POST(request: Request) {
  let body: LogBody = {};
  try {
    body = (await request.json()) as LogBody;
  } catch {
    body = {};
  }

  const session_id = typeof body.session_id === 'string' ? body.session_id : '';
  const source = typeof body.source === 'string' ? body.source : undefined;
  const event_name = typeof body.event_name === 'string' ? body.event_name : '';
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

  if (!session_id || !event_name) {
    return NextResponse.json(
      { ok: false, error: 'session_id and event_name are required' },
      { status: 400 },
    );
  }

  try {
    await dbConnect();

    const update: Record<string, unknown> = {
      $setOnInsert: {
        session_id,
        // Attribution should be stable per session.
        // Save `source` on first insert; don't overwrite on subsequent events.
        source: source ?? null,
        created_at: new Date(),
      },
      $push: {
        events: {
          event_name,
          timestamp: new Date(),
          metadata,
        },
      },
    };

    await UserLog.findOneAndUpdate({ session_id }, update, {
      upsert: true,
      setDefaultsOnInsert: true,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/log] failed:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
