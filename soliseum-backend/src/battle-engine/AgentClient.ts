/**
 * Agent client - calls external AI Agent APIs or uses MockAgent when API unavailable.
 */

import type { BattleChallenge, BattleResponse, AgentConfig } from "./types";

const REQUEST_TIMEOUT_MS = 30_000;

export interface AgentClient {
  getConfig(): AgentConfig;
  /** Send challenge and return response. Throws on failure. */
  solve(challenge: BattleChallenge): Promise<BattleResponse>;
}

/**
 * Real agent - POSTs challenge to external API.
 * Expected API contract: POST { challenge } -> { response }
 */
export class HttpAgentClient implements AgentClient {
  constructor(private config: AgentConfig) {
    if (!config.apiUrl) throw new Error("HttpAgentClient requires apiUrl");
  }

  getConfig(): AgentConfig {
    return this.config;
  }

  async solve(challenge: BattleChallenge): Promise<BattleResponse> {
    const url = this.config.apiUrl!;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Agent API ${url} returned ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as { response?: BattleResponse };
      if (!data.response) {
        throw new Error("Agent API did not return { response }");
      }
      return data.response;
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  }
}
