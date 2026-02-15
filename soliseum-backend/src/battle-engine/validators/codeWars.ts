/**
 * Code Wars validator - runs code in sandbox against hidden test cases.
 * Win: 1st priority = passed test count, 2nd = execution time (lower = better).
 *
 * Security: Uses spawn with SAFE_ENV only - NEVER passes process.env to avoid
 * leaking ORACLE_PRIVATE_KEY or other secrets. User code runs in isolated process.
 * For stronger sandboxing (prevent require/fs), add isolated-vm and use runInIsolate.
 */

import { spawn } from "child_process";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { CodeWarsResponse } from "../types";

const EXECUTION_TIMEOUT_MS = 5000;

/** Minimal env for spawn - NEVER pass process.env (contains ORACLE_PRIVATE_KEY etc.) */
const SAFE_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH || (process.platform === "win32" ? process.env.Path || "" : "/usr/bin"),
  NODE_OPTIONS: "",
};

export interface CodeWarsResult {
  passed: number;
  total: number;
  executionTimeMs: number;
  error?: string;
}

/**
 * Run JavaScript code in isolated Node process with timeout.
 * Uses SAFE_ENV only - no process.env secrets exposed to user code.
 */
export async function validateCodeWars(
  response: CodeWarsResponse,
  testCases: Array<{ input: unknown[]; expected: unknown }>,
  functionName: string
): Promise<CodeWarsResult> {
  if (typeof response.code !== "string" || response.code.trim().length === 0) {
    return { passed: 0, total: testCases.length, executionTimeMs: 0, error: "No code provided" };
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "codewars-"));
  const scriptPath = join(tmpDir, "run.js");

  try {
    const harness = `
"use strict";
${response.code}

const testCases = ${JSON.stringify(testCases)};
const fnName = ${JSON.stringify(functionName)};

let passed = 0;
const start = Date.now();

try {
  const fn = typeof eval(fnName) === 'function' ? eval(fnName) : null;
  if (!fn) {
    console.log(JSON.stringify({ passed: 0, total: testCases.length, error: 'Function ' + fnName + ' not found' }));
    process.exit(0);
  }
  for (const tc of testCases) {
    const result = fn.apply(null, tc.input);
    const ok = JSON.stringify(result) === JSON.stringify(tc.expected);
    if (ok) passed++;
  }
  const elapsed = Date.now() - start;
  console.log(JSON.stringify({ passed, total: testCases.length, executionTimeMs: elapsed }));
} catch (e) {
  console.log(JSON.stringify({ passed: 0, total: testCases.length, error: String(e && e.message || e) }));
}
`;

    writeFileSync(scriptPath, harness, "utf8");

    const result = await new Promise<CodeWarsResult>((resolve) => {
      const proc = spawn("node", [scriptPath], {
        cwd: tmpDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: SAFE_ENV,
      });

      let stdout = "";
      let stderr = "";
      proc.stdout?.on("data", (d) => (stdout += d.toString()));
      proc.stderr?.on("data", (d) => (stderr += d.toString()));

      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve({
          passed: 0,
          total: testCases.length,
          executionTimeMs: EXECUTION_TIMEOUT_MS,
          error: "Execution timeout",
        });
      }, EXECUTION_TIMEOUT_MS);

      proc.on("close", (code, signal) => {
        clearTimeout(timeout);
        try {
          const out = JSON.parse(stdout.trim() || "{}") as {
            passed?: number;
            total?: number;
            executionTimeMs?: number;
            error?: string;
          };
          resolve({
            passed: out.passed ?? 0,
            total: out.total ?? testCases.length,
            executionTimeMs: out.executionTimeMs ?? 0,
            error: out.error ?? (stderr || (code !== 0 && signal ? "Process killed" : undefined)),
          });
        } catch {
          resolve({
            passed: 0,
            total: testCases.length,
            executionTimeMs: 0,
            error: stderr || "Invalid output",
          });
        }
      });
    });

    return result;
  } finally {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch {
      /* ignore */
    }
  }
}
