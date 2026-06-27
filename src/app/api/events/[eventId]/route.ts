import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getEventParamsSchema } from '@/validators/event';
import { HoldStatus, OrderStatus } from '@/generated/prisma/enums';
import { EVENT_NOT_FOUND, handleError } from '@/lib/errors';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const rawParams = await params;
    const parseResult = getEventParamsSchema.safeParse(rawParams);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues[0]?.message || 'Invalid parameters';
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }
    const { eventId } = parseResult.data;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        tiers: {
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
        }
      }
    });

    if (!event) {
      throw EVENT_NOT_FOUND;
    }

    const tiersWithAvailableInventory = event.tiers.map((tier) => {
      const activeHolds = tier.holds.reduce((sum, hold) => sum + hold.quantity, 0);
      const paidOrders = tier.orders.reduce((sum, order) => sum + order.quantity, 0);
      const availableInventory = Math.max(0, tier.totalInventory - activeHolds - paidOrders);

      const { holds, orders, ...tierData } = tier;
      return {
        ...tierData,
        availableInventory
      };
    });

    return NextResponse.json({
      id: event.id,
      title: event.title,
      venue: event.venue,
      startsAt: event.startsAt,
      tiers: tiersWithAvailableInventory
    });
  } catch (error: any) {
    return handleError(error);
  }
}
