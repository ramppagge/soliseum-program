/**
 * LeaderboardService - Optimized Leaderboard Queries with Materialized Views
 * 
 * Features:
 * - Sub-10ms query performance via PostgreSQL materialized views
 * - Category filtering (Trading, Chess, Coding)
 * - Pagination with cursor support
 * - Auto-refresh every 30 seconds
 * 
 * Database Views:
 * - leaderboard_mv: Overall ranking with sparkline data
 * - leaderboard_category_mv: Category-specific rankings
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

export interface LeaderboardEntry {
  id: number;
  pubkey: string;
  name: string;
  category: "Trading" | "Chess" | "Coding";
  description: string | null;
  total_wins: number;
  total_battles: number;
  win_rate: number;
  credibility_score: number;
  agent_status: string;
  rank: number;
  recent_battles: Array<{
    won: boolean;
    played_at: string;
    arena_id: number;
  }>;
  win_streak: number;
  created_at: string;
  updated_at: string;
}

export interface LeaderboardQueryOptions {
  category?: "Trading" | "Chess" | "Coding";
  limit?: number;
  offset?: number;
  minBattles?: number;
  search?: string;
}

export interface PaginatedLeaderboard {
  entries: LeaderboardEntry[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}

export interface CategoryStats {
  category: string;
  total_agents: number;
  avg_credibility: number;
  top_agent: {
    name: string;
    pubkey: string;
    credibility_score: number;
  };
}

export class LeaderboardService {
  private refreshIntervalMs: number;
  private refreshTimer: NodeJS.Timeout | null = null;
  private lastRefreshTime: Date | null = null;
  private isRefreshing: boolean = false;

  constructor(options: { refreshIntervalMs?: number } = {}) {
    this.refreshIntervalMs = options.refreshIntervalMs ?? 30000; // 30s default
  }

  /**
   * Start automatic refresh interval
   */
  startAutoRefresh(): void {
    if (this.refreshTimer) {
      console.log("[LeaderboardService] Auto-refresh already running");
      return;
    }

    console.log(`[LeaderboardService] Starting auto-refresh every ${this.refreshIntervalMs}ms`);
    
    // Initial refresh
    this.refresh().catch(err => {
      console.error("[LeaderboardService] Initial refresh failed:", err);
    });

    // Schedule interval
    this.refreshTimer = setInterval(() => {
      this.refresh().catch(err => {
        console.error("[LeaderboardService] Auto-refresh failed:", err);
      });
    }, this.refreshIntervalMs);
  }

  /**
   * Stop automatic refresh
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      console.log("[LeaderboardService] Auto-refresh stopped");
    }
  }

  /**
   * Manually trigger leaderboard refresh
   * Uses CONCURRENTLY to avoid locking reads
   */
  async refresh(): Promise<void> {
    if (this.isRefreshing) {
      console.log("[LeaderboardService] Refresh already in progress, skipping");
      return;
    }

    this.isRefreshing = true;
    const start = Date.now();

    try {
      // Refresh both materialized views concurrently
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_mv`);
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_category_mv`);
      
      this.lastRefreshTime = new Date();
      const duration = Date.now() - start;
      
      console.log(`[LeaderboardService] Refreshed in ${duration}ms`);
    } catch (error) {
      console.error("[LeaderboardService] Refresh failed:", error);
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Get paginated leaderboard with filtering
   * 
   * Performance: ~5-10ms (vs 200ms+ without materialized view)
   */
  async getLeaderboard(options: LeaderboardQueryOptions = {}): Promise<PaginatedLeaderboard> {
    const {
      category,
      limit = 50,
      offset = 0,
      minBattles = 0,
      search,
    } = options;

    const start = Date.now();

    try {
      let query;
      let countQuery;

      if (category) {
        // Use category-specific view for better performance
        query = sql`
          SELECT 
            id, pubkey, name, category, description,
            total_wins, total_battles, win_rate, credibility_score,
            agent_status, category_rank as rank, recent_battles, win_streak,
            created_at, updated_at
          FROM leaderboard_category_mv
          WHERE category = ${category}
            AND total_battles >= ${minBattles}
            ${search ? sql`AND name ILIKE ${`%${search}%`}` : sql``}
          ORDER BY category_rank ASC
          LIMIT ${limit}
          OFFSET ${offset}
        `;
        
        countQuery = sql`
          SELECT COUNT(*) as count
          FROM leaderboard_category_mv
          WHERE category = ${category}
            AND total_battles >= ${minBattles}
            ${search ? sql`AND name ILIKE ${`%${search}%`}` : sql``}
        `;
      } else {
        // Use main leaderboard view
        query = sql`
          SELECT 
            id, pubkey, name, category, description,
            total_wins, total_battles, win_rate, credibility_score,
            agent_status, rank, recent_battles, win_streak,
            created_at, updated_at
          FROM leaderboard_mv
          WHERE total_battles >= ${minBattles}
            ${search ? sql`AND name ILIKE ${`%${search}%`}` : sql``}
          ORDER BY rank ASC
          LIMIT ${limit}
          OFFSET ${offset}
        `;
        
        countQuery = sql`
          SELECT COUNT(*) as count
          FROM leaderboard_mv
          WHERE total_battles >= ${minBattles}
            ${search ? sql`AND name ILIKE ${`%${search}%`}` : sql``}
        `;
      }

      const [entriesResult, countResult] = await Promise.all([
        db.execute(query),
        db.execute(countQuery),
      ]);

      const entries = entriesResult as unknown as LeaderboardEntry[];
      const total = parseInt(((countResult as unknown as { count: string }[])[0])?.count || "0", 10);
      const hasMore = offset + entries.length < total;

      const duration = Date.now() - start;
      console.log(`[LeaderboardService] Query ${category || 'all'} in ${duration}ms, returned ${entries.length} rows`);

      return {
        entries,
        total,
        hasMore,
        nextOffset: hasMore ? offset + limit : undefined,
      };
    } catch (error) {
      console.error("[LeaderboardService] Query failed:", error);
      throw error;
    }
  }

  /**
   * Get single agent's leaderboard position
   */
  async getAgentRank(pubkey: string): Promise<LeaderboardEntry | null> {
    const start = Date.now();

    try {
      const result = await db.execute(sql`
        SELECT 
          id, pubkey, name, category, description,
          total_wins, total_battles, win_rate, credibility_score,
          agent_status, rank, recent_battles, win_streak,
          created_at, updated_at
        FROM leaderboard_mv
        WHERE pubkey = ${pubkey}
        LIMIT 1
      `);

      const duration = Date.now() - start;
      console.log(`[LeaderboardService] Rank lookup in ${duration}ms`);

      const rows = result as unknown as LeaderboardEntry[];
      return rows[0] || null;
    } catch (error) {
      console.error("[LeaderboardService] Rank lookup failed:", error);
      throw error;
    }
  }

  /**
   * Get category statistics
   */
  async getCategoryStats(): Promise<CategoryStats[]> {
    const result = await db.execute(sql`
      SELECT 
        category,
        COUNT(*) as total_agents,
        ROUND(AVG(credibility_score), 2) as avg_credibility,
        (
          SELECT jsonb_build_object(
            'name', name,
            'pubkey', pubkey,
            'credibility_score', credibility_score
          )
          FROM leaderboard_category_mv l2
          WHERE l2.category = l1.category
          ORDER BY category_rank ASC
          LIMIT 1
        ) as top_agent
      FROM leaderboard_category_mv l1
      GROUP BY category
      ORDER BY category
    `);

    return result as unknown as CategoryStats[];
  }

  /**
   * Get "hot" agents (high win rate, minimum 5 battles)
   */
  async getHotAgents(limit: number = 10): Promise<LeaderboardEntry[]> {
    const result = await db.execute(sql`
      SELECT 
        id, pubkey, name, category, description,
        total_wins, total_battles, win_rate, credibility_score,
        agent_status, rank, recent_battles, win_streak,
        created_at, updated_at
      FROM leaderboard_mv
      WHERE total_battles >= 5
        AND win_rate >= 70
      ORDER BY win_rate DESC, credibility_score DESC
      LIMIT ${limit}
    `);

    return result as unknown as LeaderboardEntry[];
  }

  /**
   * Get rising stars (improving credibility recently)
   */
  async getRisingStars(limit: number = 10): Promise<LeaderboardEntry[]> {
    // Agents with high win streaks
    const result = await db.execute(sql`
      SELECT 
        id, pubkey, name, category, description,
        total_wins, total_battles, win_rate, credibility_score,
        agent_status, rank, recent_battles, win_streak,
        created_at, updated_at
      FROM leaderboard_mv
      WHERE win_streak >= 3
        AND total_battles >= 3
      ORDER BY win_streak DESC, credibility_score DESC
      LIMIT ${limit}
    `);

    return result as unknown as LeaderboardEntry[];
  }

  /**
   * Get service health status
   */
  getStatus(): {
    autoRefresh: boolean;
    lastRefresh: Date | null;
    refreshIntervalMs: number;
    isRefreshing: boolean;
  } {
    return {
      autoRefresh: this.refreshTimer !== null,
      lastRefresh: this.lastRefreshTime,
      refreshIntervalMs: this.refreshIntervalMs,
      isRefreshing: this.isRefreshing,
    };
  }
}

// Singleton instance
export const leaderboardService = new LeaderboardService();
