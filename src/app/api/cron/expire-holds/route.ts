import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST() {
  const { count } = await prisma.hold.updateMany({
    where: {
      status: 'active',
      expiresAt: { lte: new Date() },
    },
    data: { status: 'expired' },
  });

  return NextResponse.json({ expired: count });
}
