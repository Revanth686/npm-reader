export function initializeCheckpoint(
  targetSequence,
  runAt,
  sequenceOverlap,
  timeOverlapMinutes,
) {
  return {
    lastSequence: Math.max(0, targetSequence - sequenceOverlap),
    initializedAt: new Date(
      Date.parse(runAt) - timeOverlapMinutes * 60 * 1000,
    ).toISOString(),
  };
}
