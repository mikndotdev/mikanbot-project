import { createClient } from "redis";
import * as Sentry from "@sentry/bun";
import { env } from "@/lib/env";

export const redis = createClient({
  url: env.REDIS_URL,
  socket: {
    connectTimeout: 3000,
    reconnectStrategy: (retries) => Math.min(100 * 2 ** Math.min(retries, 6), 5000),
  },
});

redis.on("error", (error) => {
  Sentry.captureException(error, { tags: { source: "redis" } });
});

const CONNECT_WAIT_MS = 1500;

let connecting: Promise<unknown> | null = null;
let waitedOnce = false;

export async function ensureRedis(): Promise<typeof redis | null> {
  if (redis.isReady) return redis;
  if (!redis.isOpen && !connecting) {
    connecting = redis.connect().catch((error) => {
      Sentry.captureException(error, { tags: { source: "redisConnect" } });
      connecting = null;
      return null;
    });
  }
  if (connecting && !waitedOnce) {
    waitedOnce = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      connecting,
      new Promise((resolve) => {
        timer = setTimeout(resolve, CONNECT_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
  }
  return redis.isReady ? redis : null;
}

void ensureRedis();

export async function cacheGet(key: string): Promise<string | null> {
  const client = await ensureRedis();
  if (!client) return null;
  try {
    return await client.get(key);
  } catch (error) {
    Sentry.captureException(error, { tags: { source: "cacheGet" }, extra: { key } });
    return null;
  }
}

const MAX_VALUE_BYTES = 2 * 1024 * 1024;

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (value.length > MAX_VALUE_BYTES) {
    Sentry.logger.warn("refusing to cache oversized value", { key, bytes: value.length });
    return;
  }
  const client = await ensureRedis();
  if (!client) return;
  try {
    await client.set(key, value, { EX: Math.max(1, Math.floor(ttlSeconds)) });
  } catch (error) {
    Sentry.captureException(error, { tags: { source: "cacheSet" }, extra: { key } });
  }
}

const inflight = new Map<string, Promise<unknown>>();

export interface CachedOptions {
  negativeTtlSeconds?: number;
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T | null | undefined>,
  options?: CachedOptions,
): Promise<T | null> {
  const raw = await cacheGet(key);
  if (raw !== null) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      Sentry.logger.warn("discarding unparseable cache entry", { key });
    }
  }

  const existing = inflight.get(key) as Promise<T | null> | undefined;
  if (existing) return existing;

  const task = (async (): Promise<T | null> => {
    try {
      const value = await fetcher();
      if (value === undefined) return null;
      if (value === null) {
        const negative = options?.negativeTtlSeconds ?? 0;
        if (negative > 0) await cacheSet(key, "null", negative);
        return null;
      }
      await cacheSet(key, JSON.stringify(value), ttlSeconds);
      return value;
    } catch (error) {
      Sentry.captureException(error, { tags: { source: "cached" }, extra: { key } });
      return null;
    }
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, task);
  return task;
}

export function peekCached<T>(key: string): Promise<T | null> | undefined {
  return inflight.get(key) as Promise<T | null> | undefined;
}
