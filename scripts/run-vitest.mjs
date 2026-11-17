import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const env = { ...process.env };
const vitestArgs = ["run"];

if (args[0] === "--include-slow") {
  env.RUN_SLOW_TESTS = "1";
  args.shift();
}

vitestArgs.push(...args);

const child = spawn(process.execPath, [require.resolve("vitest/vitest.mjs"), ...vitestArgs], { env, stdio: "inherit" });

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Vitest exited from signal ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
