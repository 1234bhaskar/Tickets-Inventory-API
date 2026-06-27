import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createHoldSchema } from '@/validators/hold';
import { HoldStatus, OrderStatus } from '@/generated/prisma/enums';
import { TIER_NOT_FOUND, TIER_EVENT_MISMATCH, INSUFFICIENT_INVENTORY, handleError } from '@/lib/errors';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const body = await request.json().catch(() => ({}));

    const parseResult = createHoldSchema.safeParse(body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues[0]?.message || 'Error placing order';
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const { tier_id: tierId, quantity } = parseResult.data;

    //database-level row lock
    const result = await prisma.$transaction(async (tx) => {
      // Lock the tier row in the database using FOR UPDATE to prevent race conditions
      await tx.$executeRaw`SELECT 1 FROM tiers WHERE id = ${tierId} FOR UPDATE`;

      const tier = await tx.tier.findUnique({
        where: { id: tierId },
        include: {
          holds: {
            where: {
              status: HoldStatus.active,
              expiresAt: { gt: new Date() }
            }
          },
          orders: {
            where: {
              status: OrderStatus.paid
            }
          }
        }
      });

      if (!tier) {
        throw TIER_NOT_FOUND;
      }

      if (tier.eventId !== eventId) {
        throw TIER_EVENT_MISMATCH;
      }

      const activeHolds = tier.holds.reduce((sum, hold) => sum + hold.quantity, 0);
      const paidOrders = tier.orders.reduce((sum, order) => sum + order.quantity, 0);
      const availableInventory = tier.totalInventory - activeHolds - paidOrders;

      if (quantity > availableInventory) {
        throw INSUFFICIENT_INVENTORY;
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const hold = await tx.hold.create({
        data: {
          tierId,
          quantity,
          expiresAt,
          status: HoldStatus.active
        }
      });

      return hold;
    }, { maxWait: 10000, timeout: 15000 });

    return NextResponse.json({
      hold_id: result.id,
      expires_at: result.expiresAt.toISOString()
    }, { status: 201 });

  } catch (error: any) {
    return handleError(error);
  }
}
