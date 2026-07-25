function escapeTableCell(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("!", "&#33;")
    .replaceAll("[", "&#91;")
    .replaceAll("]", "&#93;")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function badgePackageName(name) {
  return encodeURIComponent(name);
}

function compareNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function mergeCatalog(catalog, additions) {
  const packages = new Map(
    (catalog.packages ?? []).map((entry) => [entry.name, entry]),
  );
  for (const addition of additions) {
    packages.set(addition.name, addition);
  }

  return {
    schemaVersion: 1,
    packages: [...packages.values()].sort((left, right) =>
      compareNames(left.name, right.name),
    ),
  };
}

export function renderCategoryMarkdown(title, packages) {
  const rows = [...packages]
    .sort(
      (left, right) =>
        right.discoveredAt.localeCompare(left.discoveredAt) ||
        compareNames(left.name, right.name),
    )
    .map((entry) => {
      const encodedName = badgePackageName(entry.name);
      const packageLink = `[${escapeTableCell(entry.name)}](${entry.npmUrl})`;
      const repositoryLink = `[GitHub](${entry.repository})`;
      const versionBadge = `![npm version](https://img.shields.io/npm/v/${encodedName}?label=version)`;
      const downloadsBadge = `![weekly downloads](https://img.shields.io/npm/dw/${encodedName}?label=downloads)`;
      return `| ${packageLink} | ${escapeTableCell(entry.description)} | ${versionBadge} | ${downloadsBadge} | ${escapeTableCell(entry.license)} | ${repositoryLink} | ${entry.discoveredAt.slice(0, 10)} |`;
    });

  return [
    `# ${title}`,
    "",
    "<!-- This file is generated. Edit config/discovery.json or the generator instead. -->",
    "",
    "| Package | Description | Version | Downloads | License | Repository | Discovered |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

export function renderReadme(categories, packages) {
  const links = categories.map((category) => {
    const count = packages.filter(
      (entry) => entry.category === category.slug,
    ).length;
    return `- [${category.title} (${count})](packages/${category.slug}.md)`;
  });

  return [
    "# NPM Reader",
    "",
    "A curated list of newly published npm packages, refreshed automatically every 24 hours.",
    "",
    "Packages are selected from the public npm registry using deterministic metadata filters. Inclusion is for discovery only and is not a security endorsement. Review packages before installing them.",
    "",
    "## Categories",
    "",
    ...links,
    "",
    "## Automation",
    "",
    "The repository uses its own dependency-free JavaScript action. It does not star package repositories or use third-party marketplace actions.",
    "",
    "The action follows npm's replication feed from the checkpoint in `data/registry-state.json`, identifies likely new packages from first- and second-revision changes, verifies their creation timestamps, fetches their public registry metadata, applies the rules in `config/discovery.json`, and adds at most 25 packages per run. Higher-revision documents are intentionally excluded as high-churn candidates in curated mode. Temporarily unavailable and overflow candidates are retained for later runs, with configured feed-page and pending-queue limits to bound each run. The first run establishes an overlapping sequence/time checkpoint so publications at the initialization boundary are reconsidered on the next run.",
    "",
    "The workflow runs daily at 02:17 UTC and can also be started manually in dry-run mode. Scheduled workflows may start later when GitHub Actions is busy.",
    "",
    "```",
    "",
  ].join("\n");
}
