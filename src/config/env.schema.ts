import { z } from 'zod';

// NODE_ENV, BASE_URL, DATABASE_URL, SECRET_NAME, LOG_LEVEL are the only
// custom env vars this service reads. AWS_REGION is deliberately excluded:
// it is a Lambda-reserved variable injected by the runtime automatically,
// and both the AWS SDK and CloudFormation reject attempts to set it
// explicitly under a function's Environment.Variables.
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    BASE_URL: z.string().url(),
    DATABASE_URL: z.string().min(1).optional(),
    SECRET_NAME: z.string().min(1).optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
  })
  .refine((env) => Boolean(env.DATABASE_URL) || Boolean(env.SECRET_NAME), {
    message: 'Either DATABASE_URL or SECRET_NAME must be set',
    path: ['DATABASE_URL'],
  });

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
