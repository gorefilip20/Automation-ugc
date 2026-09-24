/**
 * A tiny in-process job queue. Rendering is CPU heavy (ffmpeg), so jobs run
 * one at a time by default; raise RENDER_CONCURRENCY on bigger machines.
 */
type Job = { key: string; run: () => Promise<void> };

const concurrency = Math.max(1, Number(process.env.RENDER_CONCURRENCY) || 1);
const pending: Job[] = [];
const active = new Set<string>();

function pump() {
  while (active.size < concurrency && pending.length) {
    const job = pending.shift()!;
    active.add(job.key);
    job
      .run()
      .catch((error) => console.error(`[job-queue] ${job.key} crashed:`, error))
      .finally(() => {
        active.delete(job.key);
        pump();
      });
  }
}

/** Queue a job unless one with the same key is already queued or running. */
export function enqueue(key: string, run: () => Promise<void>): boolean {
  if (active.has(key) || pending.some((j) => j.key === key)) return false;
  pending.push({ key, run });
  pump();
  return true;
}

export function queuePosition(key: string): number {
  if (active.has(key)) return 0;
  const i = pending.findIndex((j) => j.key === key);
  return i === -1 ? -1 : i + 1;
}
