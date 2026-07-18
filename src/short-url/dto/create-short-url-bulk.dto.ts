import { z } from 'zod';
import { CreateShortUrlBulkSchema } from './create-short-url-bulk.schema';

export type CreateShortUrlBulkDto = z.infer<typeof CreateShortUrlBulkSchema>;
