import { MockBoardService } from "./mockBoardService";
import { WebSocketBoardService } from "./websocketBoardService";
import type { BoardService } from "./types";

let instance: BoardService | null = null;

/**
 * Single entry point for the app's backend. Swap the mock for a real
 * WebSocket-backed implementation here without touching any UI code.
 */
export function getBoardService(): BoardService {
  if (!instance) {
    const boardWsUrl = import.meta.env.VITE_BOARD_WS_URL;
    instance =
      typeof boardWsUrl === "string" && boardWsUrl.trim() !== ""
        ? new WebSocketBoardService(boardWsUrl)
        : new MockBoardService({ persist: true, latency: 140 });
  }
  return instance;
}

export function __setBoardService(service: BoardService | null) {
  instance = service;
}
