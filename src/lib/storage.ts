import { Storage } from '@storagesdk/core';
import { tigris } from '@storagesdk/adapters/tigris';
import { env } from "@/lib/env"

export const storage = new Storage({
    adapter: tigris({
        bucket: env.STORAGE_BUCKET,
        accessKeyId: env.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
    }),
});