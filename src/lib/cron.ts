import * as Sentry from "@sentry/bun";
import type { Client } from "discord.js";
import cron, { type ScheduledTask, type TaskFn } from "node-cron";
import { setPresence } from "@/presence";
import { runAlertTick } from "@/lib/train-alerts";
import { validateSubscriptions } from "@/lib/train-webhooks";

const TIMEZONE = "Asia/Tokyo";

let registered = false;

function watch(task: ScheduledTask, name: string) {
  task.on("execution:failed", (ctx) => {
    Sentry.captureException(ctx.error ?? new Error(`cron job failed: ${name}`), {
      tags: { source: "cron", job: name },
    });
  });
  task.on("execution:overlap", () => {
    Sentry.logger.warn("cron job skipped: previous run still going", { job: name });
  });
  task.on("execution:missed", () => {
    Sentry.logger.warn("cron job missed its scheduled run", { job: name });
  });
}

function register(name: string, expression: string, fn: TaskFn) {
  const task = cron.schedule(expression, fn, {
    name,
    timezone: TIMEZONE,
    noOverlap: true,
  });
  watch(task, name);
  return task;
}

export function registerCronJobs(client: Client) {
  if (registered) return;
  registered = true;

  const alerts = register("trainAlerts", "*/1 * * * *", () => runAlertTick(client));
  register("trainWebhookValidation", "0 */6 * * *", () => validateSubscriptions(client));
  register("presence", "0 * * * *", () => setPresence(client));

  Sentry.logger.info("cron jobs registered", {
    jobs: ["trainAlerts", "trainWebhookValidation", "presence"],
    timezone: TIMEZONE,
  });

  setPresence(client);
  alerts.execute().catch(() => undefined);
}
