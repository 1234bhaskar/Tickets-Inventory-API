import { z } from 'zod';

export const cancelHoldParamsSchema = z.object({
  orderId: z.string({
    message: 'Missing or invalid orderId'
  }).min(1, 'Missing or invalid orderId')
});
