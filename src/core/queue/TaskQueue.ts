/** 通用并发任务队列：并发上限、超时、重试、单个取消与全部取消。 */

export interface QueueJob<T> {
  id: string;
  run: (signal: AbortSignal) => Promise<T>;
  timeoutMs?: number;
  retries?: number;
}

export interface QueueResult<T> {
  id: string;
  value?: T;
  error?: Error;
  attempts: number;
  cancelled: boolean;
}

export class TaskQueue {
  private readonly controllers = new Map<string, AbortController>();
  private cancelled = false;

  constructor(private readonly concurrency: number = 3) {}

  get size(): number {
    return this.controllers.size;
  }

  cancelAll(): void {
    this.cancelled = true;
    for (const controller of this.controllers.values()) controller.abort();
  }

  cancel(id: string): boolean {
    const controller = this.controllers.get(id);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  async runAll<T>(
    jobs: Array<QueueJob<T>>,
    onSettled?: (result: QueueResult<T>) => void,
  ): Promise<Array<QueueResult<T>>> {
    this.cancelled = false;
    const results: Array<QueueResult<T>> = [];
    let cursor = 0;

    const worker = async () => {
      while (cursor < jobs.length && !this.cancelled) {
        const job = jobs[cursor];
        cursor += 1;
        const result = await this.execute(job);
        results.push(result);
        onSettled?.(result);
      }
    };

    const workerCount = Math.max(1, Math.min(Math.max(1, this.concurrency), jobs.length || 1));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  }

  private async execute<T>(job: QueueJob<T>): Promise<QueueResult<T>> {
    const maxAttempts = Math.max(1, (job.retries ?? 0) + 1);
    let lastError: Error = new Error('任务未执行');

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (this.cancelled) {
        return { id: job.id, error: new Error('任务已取消'), attempts: attempt - 1, cancelled: true };
      }

      const controller = new AbortController();
      this.controllers.set(job.id, controller);
      let timer: ReturnType<typeof setTimeout> | undefined;

      try {
        const timeoutMs = job.timeoutMs ?? 0;
        const work = job.run(controller.signal);
        const value = timeoutMs > 0
          ? await Promise.race([
              work,
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  // 先 settle 超时错误，再中止任务，避免 abort 抢先覆盖错误原因
                  reject(new Error(`任务超时（${Math.round(timeoutMs / 1000)}s）`));
                  controller.abort();
                }, timeoutMs);
              }),
            ])
          : await work;
        return { id: job.id, value, attempts: attempt, cancelled: false };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (this.cancelled || controller.signal.aborted) {
          return { id: job.id, error: lastError, attempts: attempt, cancelled: this.cancelled };
        }
      } finally {
        if (timer) clearTimeout(timer);
        this.controllers.delete(job.id);
      }
    }

    return { id: job.id, error: lastError, attempts: maxAttempts, cancelled: false };
  }
}
