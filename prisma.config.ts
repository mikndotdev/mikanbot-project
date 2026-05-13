import { defineConfig } from "prisma/config";
import { env } from "./src/lib/env";

export default defineConfig({
  datasource: {
    url: env.DATABASE_URL,
  },
});
