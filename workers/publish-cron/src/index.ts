/**
 * Wakes the shop's social publisher every fifteen minutes.
 *
 * All the judgement lives on the site: which posts are approved and due, the
 * one-post-in-twenty-hours rule, the claim that stops two runs sending the
 * same picture. This only knocks. Knocking when there is nothing to send is a
 * cheap no-op, which is what makes a frequent schedule safe.
 */

interface Env {
  SITE_URL: string;
  CRON_SECRET?: string;
}

// Minimal shapes of what the runtime hands a scheduled handler; the full
// types package is not worth a dependency for two fields.
interface ScheduledController {
  cron: string;
  scheduledTime: number;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

async function knock(env: Env, cron: string): Promise<void> {
  if (!env.CRON_SECRET) {
    // Loud, not silent: a missing secret means posts stop going out.
    throw new Error("CRON_SECRET is not set on the Worker — nothing will be published");
  }

  const res = await fetch(`${env.SITE_URL}/api/social/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    // The publisher may wait up to a minute on Instagram for a Reel.
    signal: AbortSignal.timeout(90_000),
  });

  const text = await res.text();
  let summary: unknown = text.slice(0, 300);
  try {
    const body = JSON.parse(text) as {
      published?: number;
      failed?: number;
      alreadyRunning?: number;
      skipped?: string;
      held?: string;
      rules?: unknown;
    };
    summary = {
      published: body.published,
      failed: body.failed,
      alreadyRunning: body.alreadyRunning,
      skipped: body.skipped,
      // Why nothing went out when something was due: quiet hours, the daily
      // number, the gap, or a post still on its way.
      held: body.held,
      rules: body.rules,
    };
  } catch {
    // Not JSON — an error page; the first few hundred characters say enough.
  }

  console.log(JSON.stringify({ cron, status: res.status, result: summary }));

  if (!res.ok) {
    // Throwing marks the invocation as failed in the Cloudflare dashboard,
    // which is where anyone would look.
    throw new Error(`Publisher answered ${res.status}`);
  }
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(knock(env, controller.cron));
  },
};
