/**
 * 并发请求控制器 - 限制同时进行的请求数量
 *
 * 用途: 防止大量并发请求堵塞浏览器连接池,导致页面卡顿
 *
 * Chrome 对同一域名的并发连接数限制为 6 个。
 * 当有大量请求同时发起时,后续请求会被阻塞(Stalled),
 * 等待前面的请求完成后才能发送。
 *
 * 此工具将请求排队,确保同时进行的请求数不超过指定限制。
 */

export class ConcurrencyLimit {
  constructor(limit = 4) {
    this.limit = limit;        // 最大并发数
    this.running = 0;          // 当前正在执行的请求数
    this.queue = [];           // 等待队列
  }

  /**
   * 执行一个异步函数,受并发限制控制
   * @param {Function} fn - 返回 Promise 的函数
   * @returns {Promise} - fn 的执行结果
   */
  async run(fn) {
    // 如果已达到并发限制,加入队列等待
    if (this.running >= this.limit) {
      await new Promise((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      // 执行完成后,唤醒队列中的下一个请求
      if (this.queue.length > 0) {
        const resolve = this.queue.shift();
        resolve();
      }
    }
  }

  /**
   * 包装 fetch 函数,自动应用并发限制
   * @param {Function} fetchFn - 原始的 fetch 函数
   * @returns {Function} - 受并发限制的 fetch 函数
   */
  wrapFetch(fetchFn) {
    return (...args) => this.run(() => fetchFn(...args));
  }
}

/**
 * 全局默认并发控制器
 * 限制为 4 个并发请求(留 2 个连接给其他关键请求)
 */
export const globalConcurrencyLimit = new ConcurrencyLimit(4);
