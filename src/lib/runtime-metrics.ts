const state = {
  inFlight: 0,
  rejected: 0,
  total: 0,
};

export function beginRequest(maxInFlight: number) {
  state.total += 1;
  if (state.inFlight >= maxInFlight) {
    state.rejected += 1;
    return false;
  }
  state.inFlight += 1;
  return true;
}

export function endRequest() {
  state.inFlight = Math.max(0, state.inFlight - 1);
}

export function runtimeMetrics() {
  const memory = process.memoryUsage();
  return {
    processId: process.pid,
    workerIndex: process.env.API_WORKER_INDEX ?? "single",
    inFlight: state.inFlight,
    rejected: state.rejected,
    total: state.total,
    memoryMb: {
      rss: Math.round(memory.rss / 1024 / 1024),
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
    },
  };
}

export function resetRuntimeMetricsForTests() {
  state.inFlight = 0;
  state.rejected = 0;
  state.total = 0;
}
