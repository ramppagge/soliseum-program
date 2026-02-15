/**
 * Code Wars validator - runs AI-generated code in a sandboxed vm.createContext()
 * inside a resource-limited child process.
 *
 * Security layers:
 *  1. vm.createContext() — code runs in an isolated V8 context with NO access to
 *     require, process, fs, net, child_process, or any Node.js built-ins.
 *  2. --max-old-space-size=64 — hard 64 MB heap limit prevents OOM attacks.
 *  3. SAFE_ENV — only PATH is passed; no secrets (ORACLE_PRIVATE_KEY etc.).
 *  4. SIGKILL timeout — hard 5 s wall-clock kill.
 *  5. functionName is validated as a safe JS identifier before use (no eval).
 *  6. Stdout is capped to prevent memory exhaustion in the parent.
 */

import { spawn } from "child_process";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { CodeWarsResponse } from "../types";

const EXECUTION_TIMEOUT_MS = 5000;
const MAX_STDOUT_BYTES = 1024 * 64; // 64 KB cap on stdout from child
const MAX_HEAP_MB = 64;

/** Minimal env for spawn - NEVER pass process.env (contains ORACLE_PRIVATE_KEY etc.) */
const SAFE_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH || (process.platform === "win32" ? process.env.Path || "" : "/usr/bin"),
  NODE_OPTIONS: "",
};

/** Strict JS identifier regex — prevents code injection via functionName. */
const SAFE_IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

export interface CodeWarsResult {
  passed: number;
  total: number;
  executionTimeMs: number;
  error?: string;
}

/**
 * Run JavaScript code in a sandboxed vm context inside a resource-limited child process.
 * User code has NO access to require, process, fs, net, or any Node.js APIs.
 */
export async function validateCodeWars(
  response: CodeWarsResponse,
  testCases: Array<{ input: unknown[]; expected: unknown }>,
  functionName: string
): Promise<CodeWarsResult> {
  if (typeof response.code !== "string" || response.code.trim().length === 0) {
    return { passed: 0, total: testCases.length, executionTimeMs: 0, error: "No code provided" };
  }

  if (!SAFE_IDENTIFIER.test(functionName)) {
    return { passed: 0, total: testCases.length, executionTimeMs: 0, error: "Invalid function name" };
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "codewars-"));
  const scriptPath = join(tmpDir, "run.js");

  try {
    // The harness runs INSIDE the child process.
    // User code is executed within vm.createContext() which provides NO Node.js globals.
    const harness = `
"use strict";
const vm = require("vm");

const userCode = ${JSON.stringify(response.code)};
const testCases = ${JSON.stringify(testCases)};
const fnName = ${JSON.stringify(functionName)};

// Minimal sandbox: only safe JS built-ins, no require/process/fs/net/child_process
const sandbox = Object.create(null);
sandbox.Array = Array;
sandbox.Object = Object;
sandbox.String = String;
sandbox.Number = Number;
sandbox.Boolean = Boolean;
sandbox.Math = Math;
sandbox.JSON = JSON;
sandbox.Date = Date;
sandbox.RegExp = RegExp;
sandbox.Map = Map;
sandbox.Set = Set;
sandbox.WeakMap = WeakMap;
sandbox.WeakSet = WeakSet;
sandbox.Promise = Promise;
sandbox.Symbol = Symbol;
sandbox.Error = Error;
sandbox.TypeError = TypeError;
sandbox.RangeError = RangeError;
sandbox.SyntaxError = SyntaxError;
sandbox.parseInt = parseInt;
sandbox.parseFloat = parseFloat;
sandbox.isNaN = isNaN;
sandbox.isFinite = isFinite;
sandbox.undefined = undefined;
sandbox.Infinity = Infinity;
sandbox.NaN = NaN;
sandbox.console = { log: () => {}, warn: () => {}, error: () => {} };

const ctx = vm.createContext(sandbox, {
  codeGeneration: { strings: false, wasm: false },
});

try {
  // Run user code inside sandbox with a 4 s timeout (leaves 1 s for harness overhead)
  vm.runInContext(userCode, ctx, { timeout: 4000, filename: "solution.js" });

  const fn = ctx[fnName];
  if (typeof fn !== "function") {
    process.stdout.write(JSON.stringify({ passed: 0, total: testCases.length, error: "Function " + fnName + " not found" }));
    process.exit(0);
  }

  let passed = 0;
  const start = Date.now();

  for (const tc of testCases) {
    try {
      const result = fn.apply(null, tc.input);
      if (JSON.stringify(result) === JSON.stringify(tc.expected)) passed++;
    } catch (_) {
      // Individual test case failure — count as not passed
    }
  }

  const elapsed = Date.now() - start;
  process.stdout.write(JSON.stringify({ passed, total: testCases.length, executionTimeMs: elapsed }));
} catch (e) {
  const msg = e && typeof e === "object" && "message" in e ? e.message : String(e);
  process.stdout.write(JSON.stringify({ passed: 0, total: testCases.length, error: String(msg) }));
}
`;

    writeFileSync(scriptPath, harness, "utf8");

    const result = await new Promise<CodeWarsResult>((resolve) => {
      const proc = spawn("node", [`--max-old-space-size=${MAX_HEAP_MB}`, scriptPath], {
        cwd: tmpDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: SAFE_ENV,
      });

      let stdout = "";
      let stderr = "";
      let stdoutBytes = 0;

      proc.stdout?.on("data", (d: Buffer) => {
        stdoutBytes += d.length;
        if (stdoutBytes <= MAX_STDOUT_BYTES) {
          stdout += d.toString();
        }
      });
      proc.stderr?.on("data", (d: Buffer) => {
        if (stderr.length < 2048) {
          stderr += d.toString().slice(0, 2048 - stderr.length);
        }
      });

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
      /* ignore cleanup errors */
    }
  }
}
