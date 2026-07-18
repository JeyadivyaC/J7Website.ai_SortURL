import { z } from 'zod';

// Bounded well under the Lambda synchronous-invocation payload ceiling
// (6 MB request/response) so a single request can never approach it even
// with long destination URLs - see docs/architecture.md ("Bulk short URL
// creation"). Larger campaigns are expected to chunk client-side across
// multiple requests.
export const MAX_BULK_ITEMS = 2000;

export const CreateShortUrlBulkSchema = z.object({
  items: z
    .array(
      z.object({
        destination: z.string().url(),
        createdBy: z.string().min(1).max(200).optional(),
      }),
    )
    .min(1)
    .max(MAX_BULK_ITEMS),
});
