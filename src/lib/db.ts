import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });
