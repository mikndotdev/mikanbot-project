import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    AIRLABS_API_KEY: z.string(),
    API_PORT: z.string().default("3000"),
    API_SIGNING_KEY: z.string(),
    BOT_ID: z.string(),
    BOT_TOKEN: z.string(),
    DATABASE_URL: z.string(),
    DEEPSEEK_API_KEY: z.string(),
    GOOGLE_API_KEY: z.string(),
    IMG_BACKEND: z.string(),
    REDIS_URL: z.string(),
    SENTRY_DSN: z.string(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: true,
});
