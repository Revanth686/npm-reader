import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  curatePackages,
  normalizePackage,
  wasCreatedAfter,
} from "../../../src/discovery.js";
import {
  mergeCatalog,
  renderCategoryMarkdown,
  renderReadme,
} from "../../../src/generator.js";
import {
  prepareMetadataQueue,
  retainPendingPackages,
} from "../../../src/pending.js";
import {
  fetchNewPackageNames,
  fetchPackuments,
  getCurrentSequence,
} from "../../../src/registry.js";
import { initializeCheckpoint } from "../../../src/state.js";

const root = process.cwd();

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function writeGeneratedFile(relativePath, contents) {
  const fullPath = path.join(root, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  let previous = null;
  try {
    previous = await readFile(fullPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  if (previous === contents) {
    return false;
  }
  await writeFile(fullPath, contents, "utf8");
  return true;
}

async function setOutput(name, value) {
  const output = `${name}=${value}\n`;
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, output, "utf8");
  } else {
    console.log(output.trim());
  }
}

async function run() {
  const dryRunInput = process.env["INPUT_DRY-RUN"] ?? process.env.INPUT_DRY_RUN;
  const dryRun = dryRunInput?.toLowerCase() === "true";
  const config = await readJson("config/discovery.json");
  const state = await readJson("data/registry-state.json");
  const catalog = await readJson("data/packages.json");
  const runAt = new Date().toISOString();
  const targetSequence = await getCurrentSequence({
    retries: config.retries,
    timeoutMs: config.requestTimeoutMs,
  });

  let names = [];
  let selected = [];
  let nextSequence = targetSequence;
  let initializedAt = state.initializedAt;
  let nextPendingPackages = state.pendingPackages ?? [];
  if (state.lastSequence !== null) {
    const changes = await fetchNewPackageNames({
      startSequence: state.lastSequence,
      targetSequence,
      pageSize: config.changesPageSize,
      maxRevisionGeneration: config.maxRevisionGeneration,
      maxPages: config.maxChangesPagesPerRun,
      retries: config.retries,
      timeoutMs: config.requestTimeoutMs,
    });
    names = changes.names;
    nextSequence = changes.lastSequence;

    const { toProcess, overflow, droppedCount } = prepareMetadataQueue(
      state.pendingPackages ?? [],
      names,
      config.maxMetadataRequestsPerRun,
      config.maxPendingPackages,
    );
    if (droppedCount > 0) {
      console.warn(
        `Dropped ${droppedCount} excess candidates after reaching the configured pending limit.`,
      );
    }
    const metadata = await fetchPackuments(
      toProcess.map(({ name }) => name),
      {
        concurrency: config.requestConcurrency,
        retries: config.retries,
        timeoutMs: config.requestTimeoutMs,
      },
    );
    nextPendingPackages = retainPendingPackages(
      toProcess,
      overflow,
      metadata.unavailableNames,
      config.maxPendingAttempts,
    );

    const candidates = metadata.packuments
      .filter((packument) => wasCreatedAfter(packument, state.initializedAt))
      .map((packument) => normalizePackage(packument, config, runAt))
      .filter(Boolean);
    const existingNames = new Set(catalog.packages.map(({ name }) => name));
    selected = curatePackages(candidates, existingNames, config);
  } else {
    const initialCheckpoint = initializeCheckpoint(
      targetSequence,
      runAt,
      config.initialSequenceOverlap,
      config.initialTimeOverlapMinutes,
    );
    nextSequence = initialCheckpoint.lastSequence;
    initializedAt = initialCheckpoint.initializedAt;
    console.log(
      `Initializing npm registry checkpoint at ${nextSequence} with a boundary overlap; package discovery starts on the next run.`,
    );
  }

  const nextCatalog = mergeCatalog(catalog, selected);
  const nextState = {
    schemaVersion: 1,
    lastSequence: nextSequence,
    lastRunAt: runAt,
    initializedAt,
    pendingPackages: nextPendingPackages,
  };

  let changed = false;
  if (!dryRun) {
    changed =
      (await writeGeneratedFile(
        "data/packages.json",
        `${JSON.stringify(nextCatalog, null, 2)}\n`,
      )) || changed;
    changed =
      (await writeGeneratedFile(
        "data/registry-state.json",
        `${JSON.stringify(nextState, null, 2)}\n`,
      )) || changed;
    changed =
      (await writeGeneratedFile(
        "README.md",
        renderReadme(config.categories, nextCatalog.packages),
      )) || changed;

    for (const category of config.categories) {
      const packages = nextCatalog.packages.filter(
        (entry) => entry.category === category.slug,
      );
      changed =
        (await writeGeneratedFile(
          `packages/${category.slug}.md`,
          renderCategoryMarkdown(category.title, packages),
        )) || changed;
    }
  }

  console.log(
    `Inspected ${names.length} new packages and selected ${selected.length} curated packages.`,
  );
  await setOutput("changed", String(changed));
  await setOutput("discovered-count", String(names.length));
  await setOutput("selected-count", String(selected.length));
}

run().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
