import { z } from 'zod';

export const createHoldSchema = z.object({
  tier_id: z.string({
    message: 'Missing or invalid tier_id'
  }).min(1, 'Missing or invalid tier_id'),
  quantity: z.number({
    message: 'Quantity must be a positive integer'
  }).int('Quantity must be a positive integer').positive('Quantity must be a positive integer')
});

export const cancelHoldByIdParamsSchema = z.object({
  holdId: z.string({
    message: 'Missing or invalid holdId'
  }).min(1, 'Missing or invalid holdId')
});
