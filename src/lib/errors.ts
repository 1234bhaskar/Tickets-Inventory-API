import { NextResponse } from 'next/server';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export const TIER_EVENT_MISMATCH = new AppError(400, 'Tier does not belong to the specified event');
export const INSUFFICIENT_INVENTORY = new AppError(400, 'Not enough available inventory for the requested tier');

export const TIER_NOT_FOUND = new AppError(404, 'Tier not found');
export const HOLD_NOT_FOUND = new AppError(404, 'Hold not found');
export const EVENT_NOT_FOUND = new AppError(404, 'Event not found');

export const INVALID_WEBHOOK_PAYLOAD = new AppError(400, 'Invalid webhook payload');
export const WEBHOOK_PROCESSING_FAILED = new AppError(500, 'Webhook processing failed');

export function handleError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  console.error('Unhandled error:', error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
}
