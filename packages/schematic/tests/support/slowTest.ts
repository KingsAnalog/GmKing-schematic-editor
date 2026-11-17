import { it } from "vitest";

function slowTestsEnabled() {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.RUN_SLOW_TESTS === "1";
}

export const slowIt = slowTestsEnabled() ? it : it.skip;
