import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cancelHoldByIdParamsSchema } from '@/validators/hold';
import { HoldStatus } from '@/generated/prisma/enums';
import { HOLD_NOT_FOUND, handleError } from '@/lib/errors';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ holdId: string }> }
) {
  try {
    const rawParams = await params;
    const parseResult = cancelHoldByIdParamsSchema.safeParse(rawParams);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues[0]?.message || 'Invalid parameters';
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }
    const { holdId } = parseResult.data;

    const hold = await prisma.hold.findUnique({
      where: { id: holdId }
    });

    if (!hold) {
      throw HOLD_NOT_FOUND;
    }

    const updatedHold = await prisma.hold.update({
      where: { id: holdId },
      data: {
        status: HoldStatus.expired,
        expiresAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Hold explicitly expired',
      hold: {
        id: updatedHold.id,
        status: updatedHold.status,
        expiresAt: updatedHold.expiresAt.toISOString()
      }
    });
  } catch (error: any) {
    return handleError(error);
  }
}
