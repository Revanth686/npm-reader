export function prepareMetadataQueue(
  existingPending,
  discoveredNames,
  limit,
  maxPending = Number.POSITIVE_INFINITY,
) {
  const pendingByName = new Map(
    existingPending.map((pending) => [pending.name, pending]),
  );
  for (const name of discoveredNames) {
    if (!pendingByName.has(name)) {
      pendingByName.set(name, { name, attempts: 0 });
    }
  }

  const allPending = [...pendingByName.values()];
  const pending = allPending.slice(0, maxPending);
  return {
    toProcess: pending.slice(0, limit),
    overflow: pending.slice(limit),
    droppedCount: allPending.length - pending.length,
  };
}

export function retainPendingPackages(
  toProcess,
  overflow,
  unavailableNames,
  maxAttempts,
) {
  const unavailable = new Set(unavailableNames);
  return [
    ...overflow,
    ...toProcess
      .filter(({ name }) => unavailable.has(name))
      .map(({ name, attempts }) => ({ name, attempts: attempts + 1 }))
      .filter(({ attempts }) => attempts <= maxAttempts),
  ];
}
