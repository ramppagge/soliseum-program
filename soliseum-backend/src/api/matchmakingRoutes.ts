/**
 * Matchmaking API Routes
 * 
 * Endpoints:
 * - POST /api/matchmaking/enter - Agent owner enters queue
 * - POST /api/matchmaking/leave - Agent owner leaves queue
 * - GET  /api/matchmaking/queue/:pubkey - Check agent queue status
 * - GET  /api/matchmaking/battles - List active battles (staking/battling)
 * - GET  /api/matchmaking/battle/:id - Get specific battle details
 * - POST /api/matchmaking/stake - Place stake during staking window
 */

import type { Request, Response } from "express";
import { matchmakingService } from "../services/MatchmakingService";

/** POST /api/matchmaking/enter - Agent owner enters matchmaking queue */
export async function enterQueue(req: Request, res: Response): Promise<void> {
  const ownerAddress = (req as any).walletAddress as string | undefined;
  if (!ownerAddress) {
    res.status(401).json({ ok: false, error: "Authentication required" });
    return;
  }

  const { agentPubkey, category } = req.body as {
    agentPubkey: string;
    category: "Trading" | "Chess" | "Coding";
  };

  if (!agentPubkey || !category) {
    res.status(400).json({ ok: false, error: "Missing agentPubkey or category" });
    return;
  }

  // Verify ownership
  try {
    const { db } = await import("../db");
    const { agents } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    
    const [agent] = await db
      .select({ ownerAddress: agents.ownerAddress })
      .from(agents)
      .where(eq(agents.pubkey, agentPubkey))
      .limit(1);

    if (!agent) {
      res.status(404).json({ ok: false, error: "Agent not found" });
      return;
    }

    if (agent.ownerAddress && agent.ownerAddress !== ownerAddress) {
      res.status(403).json({ ok: false, error: "Only the agent owner can enter queue" });
      return;
    }
  } catch (error) {
    console.error("[enterQueue] Ownership check failed:", error);
    res.status(500).json({ ok: false, error: "Failed to verify ownership" });
    return;
  }

  const result = await matchmakingService.enterQueue(agentPubkey, category);
  res.status(result.success ? 200 : 400).json(result);
}

/** POST /api/matchmaking/leave - Agent owner leaves queue */
export async function leaveQueue(req: Request, res: Response): Promise<void> {
  const ownerAddress = (req as any).walletAddress as string | undefined;
  if (!ownerAddress) {
    res.status(401).json({ ok: false, error: "Authentication required" });
    return;
  }

  const { agentPubkey } = req.body as { agentPubkey: string };

  if (!agentPubkey) {
    res.status(400).json({ ok: false, error: "Missing agentPubkey" });
    return;
  }

  // Verify ownership
  try {
    const { db } = await import("../db");
    const { agents } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    
    const [agent] = await db
      .select({ ownerAddress: agents.ownerAddress })
      .from(agents)
      .where(eq(agents.pubkey, agentPubkey))
      .limit(1);

    if (agent?.ownerAddress && agent.ownerAddress !== ownerAddress) {
      res.status(403).json({ ok: false, error: "Only the agent owner can leave queue" });
      return;
    }
  } catch (error) {
    console.error("[leaveQueue] Ownership check failed:", error);
  }

  const success = await matchmakingService.leaveQueue(agentPubkey);
  res.json({ ok: success });
}

/** GET /api/matchmaking/status/:pubkey - Check agent's matchmaking status */
export async function getQueueStatus(req: Request, res: Response): Promise<void> {
  const { pubkey } = req.params;

  if (!pubkey) {
    res.status(400).json({ ok: false, error: "Missing pubkey" });
    return;
  }

  try {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");

    // Get agent status
    const [agent] = await db.execute(sql`
      SELECT 
        a.pubkey, a.name, a.category, a.elo_rating, a.matchmaking_status,
        EXISTS(SELECT 1 FROM matchmaking_queue q WHERE q.agent_pubkey = a.pubkey) as in_queue,
        (SELECT EXTRACT(EPOCH FROM (q.expires_at - NOW()))::INTEGER 
         FROM matchmaking_queue q WHERE q.agent_pubkey = a.pubkey) as queue_time_remaining
      FROM agents a
      WHERE a.pubkey = ${pubkey}
    `);

    const agentData = agent as unknown as {
      pubkey: string;
      name: string;
      category: string;
      elo_rating: number;
      matchmaking_status: string;
      in_queue: boolean;
      queue_time_remaining: number;
    }[];

    if (!agentData || agentData.length === 0) {
      res.status(404).json({ ok: false, error: "Agent not found" });
      return;
    }

    const a = agentData[0];

    // Check for active battle
    const [battle] = await db.execute(sql`
      SELECT battle_id, status, seconds_until_battle
      FROM active_battles_view
      WHERE agent_a_pubkey = ${pubkey} OR agent_b_pubkey = ${pubkey}
      LIMIT 1
    `);

    const battleData = battle as unknown as {
      battle_id: string;
      status: string;
      seconds_until_battle: number;
    }[];

    res.json({
      ok: true,
      agent: {
        pubkey: a.pubkey,
        name: a.name,
        category: a.category,
        elo_rating: a.elo_rating,
        status: a.matchmaking_status,
      },
      queue: a.in_queue ? {
        time_remaining: Math.max(0, a.queue_time_remaining),
      } : null,
      battle: battleData?.[0] || null,
    });
  } catch (error) {
    console.error("[getQueueStatus] Error:", error);
    res.status(500).json({ ok: false, error: "Failed to get status" });
  }
}

/** GET /api/matchmaking/battles - List active battles */
export async function getActiveBattles(_req: Request, res: Response): Promise<void> {
  try {
    const battles = await matchmakingService.getActiveBattles();
    res.json({ ok: true, battles });
  } catch (error) {
    console.error("[getActiveBattles] Error:", error);
    res.status(500).json({ ok: false, error: "Failed to get battles" });
  }
}

/** GET /api/matchmaking/battle/:id - Get specific battle details */
export async function getBattle(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({ ok: false, error: "Missing battle ID" });
    return;
  }

  try {
    const battle = await matchmakingService.getBattle(id);
    
    if (!battle) {
      res.status(404).json({ ok: false, error: "Battle not found" });
      return;
    }

    // Get stakes for this battle
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");

    const stakes = await db.execute(sql`
      SELECT s.*, u.username
      FROM scheduled_battle_stakes s
      LEFT JOIN users u ON s.user_address = u.wallet_address
      WHERE s.battle_id = ${battle.id}
      ORDER BY s.amount DESC
    `);

    res.json({
      ok: true,
      battle,
      stakes: stakes as unknown,
    });
  } catch (error) {
    console.error("[getBattle] Error:", error);
    res.status(500).json({ ok: false, error: "Failed to get battle" });
  }
}

/** POST /api/matchmaking/stake - Place stake during staking window */
export async function placeStake(req: Request, res: Response): Promise<void> {
  const userAddress = (req as any).walletAddress as string | undefined;
  if (!userAddress) {
    res.status(401).json({ ok: false, error: "Authentication required" });
    return;
  }

  const { battleId, agentPubkey, amount } = req.body as {
    battleId: number;
    agentPubkey: string;
    amount: string; // Lamports as string (BigInt)
  };

  if (!battleId || !agentPubkey || !amount) {
    res.status(400).json({ ok: false, error: "Missing required fields" });
    return;
  }

  const result = await matchmakingService.placeStake({
    user_address: userAddress,
    battle_id: battleId,
    agent_pubkey: agentPubkey,
    side: 0, // Will be determined by service
    amount: BigInt(amount),
  });

  res.status(result.success ? 200 : 400).json(result);
}
