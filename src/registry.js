const REPLICATION_URL = "https://replicate.npmjs.com";
const REGISTRY_URL = "https://registry.npmjs.org";

class HttpError extends Error {
  constructor(status, url) {
    super(`Request failed with HTTP ${status}: ${url}`);
    this.status = status;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchJson(
  url,
  { fetchImpl = fetch, retries = 3, timeoutMs = 15_000 } = {},
) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": "npm-reader/1.0",
        },
        signal: controller.signal,
      });

      if (response.ok) {
        return await response.json();
      }
      if (response.status !== 429 && response.status < 500) {
        throw new HttpError(response.status, url);
      }
      lastError = new Error(`Retryable HTTP ${response.status}: ${url}`);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < retries) {
      await delay(250 * 2 ** attempt);
    }
  }

  throw lastError;
}

export async function getCurrentSequence(options = {}) {
  const metadata = await fetchJson(`${REPLICATION_URL}/`, options);
  if (!Number.isSafeInteger(metadata.update_seq)) {
    throw new Error(
      "npm replication metadata did not contain a numeric update_seq",
    );
  }
  return metadata.update_seq;
}

export async function fetchNewPackageNames({
  startSequence,
  targetSequence,
  pageSize,
  maxRevisionGeneration = 10,
  maxPages = Number.POSITIVE_INFINITY,
  fetchImpl = fetch,
  retries = 3,
  timeoutMs = 15_000,
}) {
  if (
    !Number.isSafeInteger(startSequence) ||
    !Number.isSafeInteger(targetSequence)
  ) {
    throw new Error("Registry checkpoints must be safe integers");
  }
  if (targetSequence < startSequence) {
    throw new Error("Target checkpoint cannot precede the saved checkpoint");
  }

  const names = new Set();
  let currentSequence = startSequence;
  let pagesRead = 0;

  while (currentSequence < targetSequence && pagesRead < maxPages) {
    const url = new URL(`${REPLICATION_URL}/_changes`);
    url.searchParams.set("since", String(currentSequence));
    url.searchParams.set("limit", String(pageSize));
    const page = await fetchJson(url, { fetchImpl, retries, timeoutMs });
    pagesRead += 1;
    const results = Array.isArray(page.results) ? page.results : [];

    if (results.length === 0) {
      throw new Error(
        `Registry changes feed stopped before checkpoint ${targetSequence}`,
      );
    }

    for (const change of results) {
      if (!Number.isSafeInteger(change.seq)) {
        throw new Error(
          "Registry changes feed returned a non-numeric sequence",
        );
      }
      if (change.seq > targetSequence) {
        break;
      }

      currentSequence = change.seq;
      const revision = change.changes?.[0]?.rev;
      const revisionGeneration = Number.parseInt(revision?.split("-")[0], 10);
      if (
        !change.deleted &&
        Number.isSafeInteger(revisionGeneration) &&
        revisionGeneration <= maxRevisionGeneration
      ) {
        names.add(change.id);
      }
    }

    if (currentSequence >= targetSequence) {
      break;
    }

    const pageLastSequence = page.last_seq;
    if (
      Number.isSafeInteger(pageLastSequence) &&
      pageLastSequence <= targetSequence &&
      pageLastSequence > currentSequence
    ) {
      currentSequence = pageLastSequence;
    }

    const finalResultSequence = results.at(-1)?.seq;
    if (finalResultSequence > targetSequence) {
      currentSequence = targetSequence;
      break;
    }
  }

  return { names: [...names], lastSequence: currentSequence, pagesRead };
}

export async function fetchPackuments(
  names,
  { concurrency = 8, fetchImpl = fetch, retries = 3, timeoutMs = 15_000 } = {},
) {
  const results = new Array(names.length);
  const unavailableNames = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < names.length) {
      const index = nextIndex;
      nextIndex += 1;
      const name = names[index];
      const url = `${REGISTRY_URL}/${encodeURIComponent(name)}`;
      try {
        results[index] = await fetchJson(url, {
          fetchImpl,
          retries,
          timeoutMs,
        });
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) {
          console.warn(`Deferring unavailable package ${name}`);
          unavailableNames.push(name);
          results[index] = null;
        } else {
          throw error;
        }
      }
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), names.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return {
    packuments: results.filter(Boolean),
    unavailableNames,
  };
}
