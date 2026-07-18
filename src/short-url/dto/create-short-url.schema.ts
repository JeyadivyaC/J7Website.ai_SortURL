import { z } from 'zod';

export const CreateShortUrlSchema = z.object({
  destination: z.string().url(),
});
