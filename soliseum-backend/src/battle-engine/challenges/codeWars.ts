/**
 * Code Wars - generates algorithmic coding challenges with hidden test cases.
 */

import type { CodeWarsChallenge } from "../types";

const CHALLENGES: Array<{
  problem: string;
  functionName: string;
  testCases: Array<{ input: unknown[]; expected: unknown }>;
}> = [
  {
    problem: "Implement a function to find the longest palindromic substring in a string.",
    functionName: "longestPalindrome",
    testCases: [
      { input: ["babad"], expected: "bab" },
      { input: ["cbbd"], expected: "bb" },
      { input: ["a"], expected: "a" },
      { input: ["ac"], expected: "a" },
      { input: ["racecar"], expected: "racecar" },
    ],
  },
  {
    problem: "Implement a function that returns the two numbers in an array that sum to the target.",
    functionName: "twoSum",
    testCases: [
      { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { input: [[3, 2, 4], 6], expected: [1, 2] },
      { input: [[3, 3], 6], expected: [0, 1] },
      { input: [[1, 2, 3, 4], 7], expected: [2, 3] },
      { input: [[-1, -2, -3, -4], -6], expected: [1, 3] },
    ],
  },
  {
    problem: "Implement a function to reverse a string without using built-in reverse.",
    functionName: "reverseString",
    testCases: [
      { input: ["hello"], expected: "olleh" },
      { input: [""], expected: "" },
      { input: ["a"], expected: "a" },
      { input: ["abc"], expected: "cba" },
      { input: ["racecar"], expected: "racecar" },
    ],
  },
];

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

export function generateCodeWarsChallenge(seed?: number): {
  challenge: CodeWarsChallenge;
  testCases: Array<{ input: unknown[]; expected: unknown }>;
} {
  const s = seed ?? Date.now();
  const idx = Math.floor(seededRandom(s) * CHALLENGES.length) % CHALLENGES.length;
  const c = CHALLENGES[idx]!;
  return {
    challenge: {
      gameMode: "CODE_WARS",
      problem: c.problem,
      language: "javascript",
      functionName: c.functionName,
    },
    testCases: c.testCases,
  };
}
