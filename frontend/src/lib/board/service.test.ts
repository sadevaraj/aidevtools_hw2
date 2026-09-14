import { afterEach, describe, expect, it, vi } from "vitest";

const mockBoardServiceConstructor = vi.fn();
const webSocketBoardServiceConstructor = vi.fn();

vi.mock("./mockBoardService", () => ({
  MockBoardService: class MockBoardService {
    kind = "mock";
    constructor(public options?: unknown) {
      mockBoardServiceConstructor(options);
    }
  },
}));

vi.mock("./websocketBoardService", () => ({
  WebSocketBoardService: class WebSocketBoardService {
    kind = "websocket";
    constructor(public url: string) {
      webSocketBoardServiceConstructor(url);
    }
  },
}));

import { MockBoardService } from "./mockBoardService";
import { __setBoardService, getBoardService } from "./service";
import { WebSocketBoardService } from "./websocketBoardService";

describe("getBoardService", () => {
  afterEach(() => {
    __setBoardService(null);
    mockBoardServiceConstructor.mockClear();
    webSocketBoardServiceConstructor.mockClear();
    vi.unstubAllEnvs();
  });

  it.each([undefined, "", "   "])(
    "selects MockBoardService when VITE_BOARD_WS_URL is %p",
    (value) => {
      if (value === undefined) {
        vi.unstubAllEnvs();
        delete import.meta.env.VITE_BOARD_WS_URL;
      } else {
        vi.stubEnv("VITE_BOARD_WS_URL", value);
      }

      const service = getBoardService();

      expect(service).toBeInstanceOf(MockBoardService);
      expect(mockBoardServiceConstructor).toHaveBeenCalledOnce();
      expect(mockBoardServiceConstructor).toHaveBeenCalledWith({
        persist: true,
        latency: 140,
      });
      expect(webSocketBoardServiceConstructor).not.toHaveBeenCalled();
      expect(service).toMatchObject({
        kind: "mock",
        options: { persist: true, latency: 140 },
      });
      expect(getBoardService()).toBe(service);
    },
  );

  it("selects WebSocketBoardService when VITE_BOARD_WS_URL is set", () => {
    vi.stubEnv("VITE_BOARD_WS_URL", "ws://example.test/ws");

    const service = getBoardService();

    expect(service).toBeInstanceOf(WebSocketBoardService);
    expect(webSocketBoardServiceConstructor).toHaveBeenCalledOnce();
    expect(webSocketBoardServiceConstructor).toHaveBeenCalledWith(
      "ws://example.test/ws",
    );
    expect(mockBoardServiceConstructor).not.toHaveBeenCalled();
    expect(service).toMatchObject({
      kind: "websocket",
      url: "ws://example.test/ws",
    });
    expect(getBoardService()).toBe(service);
  });
});
