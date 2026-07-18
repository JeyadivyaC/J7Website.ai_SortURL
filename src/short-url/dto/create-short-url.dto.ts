import { z } from 'zod';
import { CreateShortUrlSchema } from './create-short-url.schema';

export type CreateShortUrlDto = z.infer<typeof CreateShortUrlSchema>;
