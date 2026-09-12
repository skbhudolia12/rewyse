import { z } from 'zod';

/**
 * Environment validation at the boundary. A missing key fails loudly at boot
 * rather than surfacing as an opaque 401 from Supabase three screens into a
 * signup flow.
 *
 * Split deliberately: `publicEnv` is inlined into the browser bundle, so
 * anything secret must live in `serverEnv` and never be imported from a client
 * component.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

// Next.js inlines process.env.NEXT_PUBLIC_* only for statically-written keys,
// so these must be spelled out rather than iterated.
const parsedPublic = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

if (!parsedPublic.success) {
  throw new Error(
    `Invalid public environment. Copy .env.example to .env.local and fill it in.\n${parsedPublic.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')}`,
  );
}

export const publicEnv = parsedPublic.data;

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
});

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

/**
 * Lazily parsed so importing a module that transitively touches this file from
 * a client component does not throw. Call only from server code.
 */
export function serverEnv(): z.infer<typeof serverSchema> {
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment.\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
