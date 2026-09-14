import { MockBoardService } from "./mockBoardService";
import type { BoardService } from "./types";

let instance: BoardService | null = null;

/**
 * Single entry point for the app's backend. Swap the mock for a real
 * WebSocket-backed implementation here without touching any UI code.
 */
export function getBoardService(): BoardService {
  if (!instance) {
    instance = new MockBoardService({ persist: true, latency: 140 });
  }
  return instance;
}

export function __setBoardService(service: BoardService | null) {
  instance = service;
}
