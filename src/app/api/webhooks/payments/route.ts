import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { webhookPayloadSchema } from '@/validators/webhook';
import { INVALID_WEBHOOK_PAYLOAD, handleError } from '@/lib/errors';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Handle CORS preflight requests.
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) throw INVALID_WEBHOOK_PAYLOAD;

    const parseResult = webhookPayloadSchema.safeParse(body);
    if (!parseResult.success) {
      throw INVALID_WEBHOOK_PAYLOAD;
    }

    const data = parseResult.data;

    // Idempotency check — event_id is globally unique per webhook delivery
    const existing = await prisma.webhookEvent.findUnique({
      where: { id: data.event_id },
    });
    if (existing) {
      return NextResponse.json({ status: 'already_processed' }, { status: 200, headers: corsHeaders });
    }

    await prisma.$transaction(async (tx) => {
      const dup = await tx.webhookEvent.findUnique({ where: { id: data.event_id } });
      if (dup) return;

      if (data.type === 'order.paid') {
        const hold = await tx.hold.findFirst({
          where: { tierId: data.tier_id, status: 'active' },
          orderBy: { expiresAt: 'desc' },
        });

        if (hold) {
          await tx.hold.update({
            where: { id: hold.id },
            data: { status: 'converted' },
          });
        }

        await tx.order.create({
          data: { id: data.order_id, tierId: data.tier_id, quantity: data.quantity, status: 'paid' },
        });
      } else {
        await tx.order.update({
          where: { id: data.order_id },
          data: { status: 'refunded' },
        });
      }

      await tx.webhookEvent.create({
        data: {
          id: data.event_id,
          type: data.type,
          payload: data,
        },
      });
    });

    return NextResponse.json({ status: 'processed' }, { status: 200, headers: corsHeaders });
  } catch (error: unknown) {
    return handleError(error);
  }
}
