import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Perf runs live outside `tests/e2e`, so they need their own config.
 * `fullyParallel: false` + `workers: 1` keep both tests in one worker: they
 * share the module-level report object and the last write must contain both
 * sections.
 * The reporter is `list` only so a perf run never overwrites the E2E
 * evidence in `reports/results.json`.
 */
export default defineConfig({
  ...base,
  testDir: './tests/perf',
  fullyParallel: false,
  // One worker: the two tests share the module-level report object, so the
  // final write always contains both sections.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  projects: (base.projects ?? []).filter((project) => project.name === 'desktop'),
});
