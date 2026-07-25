const PRERELEASE_PATTERN = /-\w/;

function compareNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeRepositoryUrl(repository) {
  const raw = typeof repository === "string" ? repository : repository?.url;
  if (!raw) {
    return null;
  }

  let normalized = raw.trim().replace(/^git\+/, "").replace(/#.*$/, "");
  if (normalized.startsWith("git@github.com:")) {
    normalized = `https://github.com/${normalized.slice("git@github.com:".length)}`;
  } else if (normalized.startsWith("git://github.com/")) {
    normalized = `https://github.com/${normalized.slice("git://github.com/".length)}`;
  } else if (normalized.startsWith("ssh://git@github.com/")) {
    normalized = `https://github.com/${normalized.slice("ssh://git@github.com/".length)}`;
  }

  try {
    const url = new URL(normalized);
    if (url.hostname.toLowerCase() !== "github.com") {
      return null;
    }

    const parts = url.pathname.replace(/^\/|\/$/g, "").replace(/\.git$/, "").split("/");
    const safePathComponent = /^[A-Za-z0-9_.-]+$/;
    if (
      parts.length < 2 ||
      !safePathComponent.test(parts[0]) ||
      !safePathComponent.test(parts[1])
    ) {
      return null;
    }
    return `https://github.com/${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

export function categorizePackage(packageMetadata, categories) {
  const searchable = [
    packageMetadata.name,
    packageMetadata.description,
    ...(Array.isArray(packageMetadata.keywords) ? packageMetadata.keywords : []),
  ]
    .join(" ")
    .toLowerCase();

  for (const category of categories) {
    if (category.keywords.some((keyword) => searchable.includes(keyword.toLowerCase()))) {
      return category.slug;
    }
  }

  return categories.at(-1)?.slug ?? "utilities";
}

export function wasCreatedAfter(packument, timestamp) {
  const createdAt = Date.parse(packument?.time?.created);
  const cutoff = Date.parse(timestamp);
  return Number.isFinite(createdAt) && Number.isFinite(cutoff) && createdAt > cutoff;
}

function qualityScore(packument, latest, repository) {
  const readmeLength = packument.readme?.trim().length ?? 0;
  const keywordCount = Array.isArray(packument.keywords) ? packument.keywords.length : 0;
  const stableMajor = Number.parseInt(latest.version.split(".")[0], 10) >= 1;

  return (
    Math.min(40, Math.floor(readmeLength / 250)) +
    Math.min(20, keywordCount * 2) +
    Math.min(20, Math.floor(packument.description.trim().length / 10)) +
    (repository ? 10 : 0) +
    (stableMajor ? 10 : 0)
  );
}

export function normalizePackage(packument, config, discoveredAt) {
  const latestVersion = packument?.["dist-tags"]?.latest;
  const latest = latestVersion ? packument?.versions?.[latestVersion] : null;
  const description = packument?.description?.trim();
  const readme = packument?.readme?.trim();
  const license =
    (typeof latest?.license === "string" ? latest.license : null) ??
    (typeof packument?.license === "string" ? packument.license : null);
  const repository = normalizeRepositoryUrl(latest?.repository ?? packument?.repository);
  const filters = config.filters;

  if (!packument?.name || !latestVersion || !latest) {
    return null;
  }
  if (latest.deprecated || packument.deprecated) {
    return null;
  }
  if (filters.excludePrerelease && PRERELEASE_PATTERN.test(latestVersion)) {
    return null;
  }
  if (filters.requireDescription && !description) {
    return null;
  }
  if (filters.requireReadme && (!readme || readme.length < filters.minReadmeLength)) {
    return null;
  }
  if (filters.requireLicense && !license) {
    return null;
  }
  if (filters.requireRepository && !repository) {
    return null;
  }

  const category = categorizePackage(
    {
      name: packument.name,
      description,
      keywords: packument.keywords,
    },
    config.categories,
  );

  return {
    name: packument.name,
    version: latestVersion,
    description,
    license,
    repository,
    npmUrl: `https://www.npmjs.com/package/${encodeURIComponent(packument.name)}`,
    category,
    createdAt: packument.time?.created ?? packument.time?.[latestVersion] ?? discoveredAt,
    discoveredAt,
    score: qualityScore(packument, latest, repository),
  };
}

export function curatePackages(candidates, existingNames, config) {
  const unique = new Map();
  for (const candidate of candidates) {
    if (candidate && !existingNames.has(candidate.name)) {
      const current = unique.get(candidate.name);
      if (!current || candidate.score > current.score) {
        unique.set(candidate.name, candidate);
      }
    }
  }

  return [...unique.values()]
    .sort((left, right) => right.score - left.score || compareNames(left.name, right.name))
    .slice(0, config.dailyLimit);
}
