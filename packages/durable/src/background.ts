/** Dev fallback when DURABLE=inngest but no Inngest dev server — runs dispatch in-process. */
export function enqueueBackground(task: () => Promise<void>): void {
  setImmediate(() => {
    void task().catch((err) => console.error("[async-run]", err));
  });
}
