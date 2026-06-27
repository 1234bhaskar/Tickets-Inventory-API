import { z } from 'zod';

const baseWebhookSchema = z.object({
  event_id: z.string().min(1, 'Missing event_id'),
  order_id: z.string().min(1, 'Missing order_id'),
  currency: z.string().min(1, 'Missing currency'),
  occurred_at: z.string().min(1, 'Missing occurred_at'),
});

export const orderPaidSchema = baseWebhookSchema.extend({
  type: z.literal('order.paid'),
  tier_id: z.string().min(1, 'Missing tier_id'),
  quantity: z.number().int().positive('Quantity must be positive'),
  amount_total: z.number().int().nonnegative(),
});

export const orderRefundedSchema = baseWebhookSchema.extend({
  type: z.literal('order.refunded'),
  amount_total: z.number().int().nonnegative(),
});

export const webhookPayloadSchema = z.discriminatedUnion('type', [
  orderPaidSchema,
  orderRefundedSchema,
]);
