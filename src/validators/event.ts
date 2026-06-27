import { z } from 'zod';

export const getEventParamsSchema = z.object({
  eventId: z.string({
    message: 'Missing or invalid eventId'
  }).min(1, 'Missing or invalid eventId')
});
