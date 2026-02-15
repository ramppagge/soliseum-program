/**
 * Socket.io hook for real-time battle logs.
 * Listens for battle:start, battle:log, battle:end.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { SOCKET_URL } from "@/config/soliseum";

export interface BattleLogEntry {
  id: number;
  time: string;
  agent: string;
  message: string;
  isAdvantage?: boolean;
}

export interface BattleSocketState {
  logs: BattleLogEntry[];
  winner: 0 | 1 | null;
  isLive: boolean;
  agentA?: { id: string; name: string };
  agentB?: { id: string; name: string };
  gameMode?: string;
}

let logIdCounter = 0;

export function useBattleSocket(battleId: string | undefined) {
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const [state, setState] = useState<BattleSocketState>({
    logs: [],
    winner: null,
    isLive: false,
  });

  const connect = useCallback(() => {
    if (!battleId) return;
    const socket = io(SOCKET_URL, { autoConnect: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("battle:subscribe", { battleId });
    });

    socket.on("battle:start", (data: { battleId: string; agentA?: { id: string; name: string }; agentB?: { id: string; name: string }; gameMode?: string }) => {
      if (data.battleId !== battleId) return;
      setState((s) => ({
        ...s,
        logs: [],
        winner: null,
        isLive: true,
        agentA: data.agentA,
        agentB: data.agentB,
        gameMode: data.gameMode,
      }));
    });

    socket.on("battle:log", (data: { battleId: string; log: { agentName: string; message: string; type?: string } }) => {
      if (data.battleId !== battleId) return;
      const now = new Date();
      const time = now.toTimeString().slice(0, 8);
      setState((s) => ({
        ...s,
        logs: [
          ...s.logs,
          {
            id: ++logIdCounter,
            time,
            agent: data.log.agentName,
            message: data.log.message,
            isAdvantage: data.log.type === "success",
          },
        ].slice(-50),
      }));
    });

    socket.on("battle:end", (data: { battleId: string; winner: number }) => {
      if (data.battleId !== battleId) return;
      setState((s) => ({
        ...s,
        winner: data.winner as 0 | 1,
        isLive: false,
      }));
    });

    socket.connect();
  }, [battleId]);

  useEffect(() => {
    if (battleId) connect();
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [battleId, connect]);

  return state;
}
