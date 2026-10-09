'use strict';
function validLimit(value) { return Number.isSafeInteger(value) && value >= 1; }
// One budget for every provider and every AI stage in this process.
class Gate {
  constructor(limit = 1) { if (!validLimit(limit)) throw Error('동시 처리 수는 1 이상의 정수로 입력하세요.'); this.limit = limit; this.active = 0; this.waiters = []; }
  setLimit(limit) {
    if (!validLimit(limit)) throw Error('동시 처리 수는 1 이상의 정수로 입력하세요.');
    if (this.active || this.waiters.length) throw Error('진행 중 요청이 정리된 뒤 상한을 바꾸세요.');
    this.limit = limit;
  }
  async run(work) {
    await new Promise(resolve => { this.waiters.push(resolve); this.drain(); });
    try { return await work(); } finally { this.active--; this.drain(); }
  }
  drain() {
    while (this.active < this.limit && this.waiters.length) { this.active++; this.waiters.shift()(); }
  }
}
module.exports = { Gate, validLimit, DEFAULT_AI_CONCURRENCY: 5 };
