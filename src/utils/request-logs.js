export function createLogCollector() {
  const logs = [];
  return {
    logs,
    log(message) {
      logs.push({ message, at: new Date().toISOString() });
    },
  };
}
