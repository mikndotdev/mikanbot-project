import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    API_PORT: z.string().default("3000"),
    API_SIGNING_KEY: z.string(),
    BOT_ID: z.string(),
    BOT_TOKEN: z.string(),
    DATABASE_URL: z.string(),
    GOOGLE_API_KEY: z.string(),
    IMG_BACKEND: z.string(),
    LOGGING_WEBHOOK_URL: z.string(),
    REDIS_URL: z.string(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: process.env.CI === "true" || process.env.SKIP_ENV_VALIDATION === "true",
});
