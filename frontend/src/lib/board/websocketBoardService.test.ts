import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketBoardService } from "./websocketBoardService";
import type { BoardEvent, BoardState, Project, Task } from "./types";

const project = (overrides: Partial<Project> = {}): Project => ({
  id: "p1",
  name: "Alpha",
  position: 0,
  hidden: false,
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "t1",
  project_id: "p1",
  title: "Build",
  assignee: "Dev",
  notes: "",
  status: "todo",
  position: 0,
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const snapshot = (
  board: Partial<BoardState> = {},
  displayNameSuggestions: string[] = [],
) => ({
  type: "snapshot" as const,
  payload: {
    board: {
      projects: [],
      tasks: [],
      ...board,
    },
    displayNameSuggestions,
  },
});

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  readyState = FakeWebSocket.CONNECTING;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error("Socket not open");
    this.sent.push(data);
  }

  close() {
    this.closeFromServer();
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  emit(message: unknown) {
    this.onmessage?.(
      {
        data: JSON.stringify(message),
      } as MessageEvent<string>,
    );
  }

  closeFromServer() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }
}

const factory = (url: string) => new FakeWebSocket(url);

const openService = (board: Partial<BoardState> = {}) => {
  const service = new WebSocketBoardService("ws://example.test/ws", {
    reconnectDelayMs: 25,
    webSocketFactory: factory,
  });
  const socket = FakeWebSocket.instances.at(-1)!;
  socket.open();
  socket.emit(snapshot(board));
  return { service, socket };
};

const sentFrames = (socket: FakeWebSocket) =>
  socket.sent.map((frame) => JSON.parse(frame) as Record<string, unknown>);

describe("WebSocketBoardService", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens one socket and emits initial subscribe events before snapshot hydration", () => {
    const service = new WebSocketBoardService("ws://example.test/ws", {
      webSocketFactory: factory,
    });

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.url).toBe("ws://example.test/ws");

    const events: BoardEvent[] = [];
    service.subscribe((event) => events.push(event));

    expect(events).toEqual([
      { type: "status", status: "reconnecting" },
      { type: "state", board: { projects: [], tasks: [] } },
      { type: "presence", editing: {} },
    ]);

    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.emit(
      snapshot({
        projects: [project()],
        tasks: [task()],
      }),
    );

    expect(events[3]).toEqual({ type: "status", status: "connected" });
    expect(events[4]).toEqual({
      type: "state",
      board: { projects: [project()], tasks: [task()] },
    });
    expect(service.getState()).toEqual({ projects: [project()], tasks: [task()] });
    expect(service.getStatus()).toBe("connected");
    expect(service.getDisplayNameSuggestions()).toEqual([]);
  });

  it("hydrates display name suggestions from snapshot payloads", () => {
    const service = new WebSocketBoardService("ws://example.test/ws", {
      webSocketFactory: factory,
    });

    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.emit(snapshot({}, ["Taylor", "Jordan"]));

    expect(service.getDisplayNameSuggestions()).toEqual(["Taylor", "Jordan"]);

    socket.emit(snapshot({}, ["Casey"]));
    expect(service.getDisplayNameSuggestions()).toEqual(["Casey"]);
  });

  it("sends every command envelope with its own requestId", async () => {
    const alpha = project();
    const item = task();
    const { service, socket } = openService({
      projects: [alpha],
      tasks: [item],
    });

    const createProjectPromise = service.createProject("Beta");
    const renameProjectPromise = service.renameProject(alpha.id, "Renamed");
    const deleteProjectPromise = service.deleteProject(alpha.id);
    const undoDeletePromise = service.undoDeleteProject(alpha.id);
    const hideProjectPromise = service.setProjectHidden(alpha.id, true);
    const reorderProjectsPromise = service.reorderProjects([alpha.id]);
    const createTaskPromise = service.createTask({
      project_id: alpha.id,
      title: "Ship",
      assignee: "Dev",
    });
    const updateTaskPromise = service.updateTask(item.id, { notes: "Note only" });
    const deleteTaskPromise = service.deleteTask(item.id);
    const moveTaskPromise = service.moveTask({
      taskId: item.id,
      project_id: alpha.id,
      status: "doing",
      index: 0,
    });
    service.setEditing(item.id, "Taylor");
    service.setEditing(null, "Taylor");

    const frames = sentFrames(socket);
    expect(frames).toHaveLength(12);

    expect(frames[0]).toMatchObject({
      type: "create_project",
      payload: { name: "Beta" },
    });
    expect(frames[1]).toMatchObject({
      type: "rename_project",
      payload: { id: alpha.id, name: "Renamed" },
    });
    expect(frames[2]).toMatchObject({
      type: "delete_project",
      payload: { id: alpha.id },
    });
    expect(frames[3]).toMatchObject({
      type: "undo_delete_project",
      payload: { id: alpha.id },
    });
    expect(frames[4]).toMatchObject({
      type: "set_project_hidden",
      payload: { id: alpha.id, hidden: true },
    });
    expect(frames[5]).toMatchObject({
      type: "reorder_projects",
      payload: { orderedIds: [alpha.id] },
    });
    expect(frames[6]).toMatchObject({
      type: "create_task",
      payload: { project_id: alpha.id, title: "Ship", assignee: "Dev" },
    });
    expect((frames[6]?.payload as Record<string, unknown>)?.notes).toBeUndefined();
    expect(frames[7]).toMatchObject({
      type: "update_task",
      payload: { id: item.id, patch: { notes: "Note only" } },
    });
    expect(frames[8]).toMatchObject({
      type: "delete_task",
      payload: { id: item.id },
    });
    expect(frames[9]).toMatchObject({
      type: "move_task",
      payload: { taskId: item.id, project_id: alpha.id, status: "doing", index: 0 },
    });
    expect(frames[10]).toMatchObject({
      type: "set_editing",
      payload: { taskId: item.id, displayName: "Taylor" },
    });
    expect(frames[11]).toMatchObject({
      type: "set_editing",
      payload: { taskId: null, displayName: "Taylor" },
    });

    const requestIds = frames.map((frame) => frame.requestId);
    expect(new Set(requestIds).size).toBe(12);
    requestIds.forEach((requestId) => expect(typeof requestId).toBe("string"));

    socket.emit({
      type: "command_ok",
      requestId: frames[0]!.requestId,
      payload: { project: project({ id: "p2", name: "Beta", position: 1 }) },
    });
    socket.emit({
      type: "command_ok",
      requestId: frames[1]!.requestId,
      payload: { project: project({ name: "Renamed" }) },
    });
    socket.emit({ type: "command_ok", requestId: frames[2]!.requestId, payload: {} });
    socket.emit({ type: "command_ok", requestId: frames[3]!.requestId, payload: {} });
    socket.emit({
      type: "command_ok",
      requestId: frames[4]!.requestId,
      payload: { project: project({ hidden: true }) },
    });
    socket.emit({ type: "command_ok", requestId: frames[5]!.requestId, payload: {} });
    socket.emit({
      type: "command_ok",
      requestId: frames[6]!.requestId,
      payload: { task: task({ id: "t2", title: "Ship" }) },
    });
    socket.emit({
      type: "command_ok",
      requestId: frames[7]!.requestId,
      payload: { task: task({ notes: "Note only" }) },
    });
    socket.emit({ type: "command_ok", requestId: frames[8]!.requestId, payload: {} });
    socket.emit({
      type: "command_ok",
      requestId: frames[9]!.requestId,
      payload: { task: task({ status: "doing" }) },
    });

    await expect(createProjectPromise).resolves.toEqual(
      project({ id: "p2", name: "Beta", position: 1 }),
    );
    await expect(renameProjectPromise).resolves.toEqual(project({ name: "Renamed" }));
    await expect(deleteProjectPromise).resolves.toBeUndefined();
    await expect(undoDeletePromise).resolves.toBeUndefined();
    await expect(hideProjectPromise).resolves.toEqual(project({ hidden: true }));
    await expect(reorderProjectsPromise).resolves.toBeUndefined();
    await expect(createTaskPromise).resolves.toEqual(task({ id: "t2", title: "Ship" }));
    await expect(updateTaskPromise).resolves.toEqual(task({ notes: "Note only" }));
    await expect(deleteTaskPromise).resolves.toBeUndefined();
    await expect(moveTaskPromise).resolves.toEqual(task({ status: "doing" }));
  });

  it("correlates out-of-order command_ok and command_error replies without optimistic state changes", async () => {
    const { service, socket } = openService();
    const seenStates: BoardState[] = [];
    service.subscribe((event) => {
      if (event.type === "state") seenStates.push(event.board);
    });

    const createPromise = service.createProject("Beta");
    const undoPromise = service.undoDeleteProject("missing");
    const [createFrame, undoFrame] = sentFrames(socket);

    expect(service.getState()).toEqual({ projects: [], tasks: [] });

    socket.emit({
      type: "command_error",
      requestId: undoFrame!.requestId,
      payload: { code: "nothing_to_undo", message: "Nothing to undo" },
    });
    socket.emit({
      type: "command_ok",
      requestId: createFrame!.requestId,
      payload: { project: project({ id: "p2", name: "Beta" }) },
    });

    await expect(undoPromise).rejects.toThrow("Nothing to undo");
    await expect(createPromise).resolves.toEqual(project({ id: "p2", name: "Beta" }));
    expect(seenStates).toEqual([{ projects: [], tasks: [] }]);

    socket.emit({
      type: "board_event",
      payload: { eventType: "project_created", project: project({ id: "p2", name: "Beta" }) },
    });
    expect(service.getState().projects).toEqual([project({ id: "p2", name: "Beta" })]);
  });

  it("reduces board events into authoritative local state", () => {
    const alpha = project();
    const beta = project({
      id: "p2",
      name: "Beta",
      position: 1,
      created_at: "2026-01-02T00:00:00Z",
    });
    const todoA = task();
    const todoB = task({
      id: "t2",
      title: "Review",
      position: 1,
      created_at: "2026-01-02T00:00:00Z",
    });
    const doingOther = task({
      id: "t3",
      project_id: beta.id,
      status: "doing",
      title: "Ship",
    });
    const { service, socket } = openService({
      projects: [alpha, beta],
      tasks: [todoA, todoB, doingOther],
    });

    socket.emit({
      type: "board_event",
      payload: { eventType: "project_hidden_set", project: project({ hidden: true }) },
    });
    socket.emit({
      type: "board_event",
      payload: { eventType: "projects_reordered", orderedIds: [beta.id, alpha.id] },
    });
    socket.emit({
      type: "board_event",
      payload: {
        eventType: "task_moved",
        task: task({
          id: todoA.id,
          project_id: beta.id,
          status: "doing",
          position: 0,
        }),
      },
    });
    socket.emit({
      type: "board_event",
      payload: {
        eventType: "task_updated",
        task: task({
          id: todoB.id,
          title: "Review now",
          created_at: "2026-01-02T00:00:00Z",
        }),
      },
    });
    socket.emit({
      type: "board_event",
      payload: {
        eventType: "project_deleted",
        project: project({
          id: "p2",
          name: "Beta",
          position: 0,
          created_at: "2026-01-02T00:00:00Z",
        }),
      },
    });
    socket.emit({
      type: "board_event",
      payload: {
        eventType: "project_restored",
        project: project({
          id: "p2",
          name: "Beta",
          position: 0,
          created_at: "2026-01-02T00:00:00Z",
        }),
      },
    });
    socket.emit({
      type: "board_event",
      payload: { eventType: "task_created", task: task({ id: "t4", title: "Added later" }) },
    });
    socket.emit({
      type: "board_event",
      payload: { eventType: "task_deleted", task: task({ id: "t4", title: "Added later" }) },
    });

    expect(service.getState()).toEqual({
      projects: [
        project({
          id: "p2",
          name: "Beta",
          position: 0,
          created_at: "2026-01-02T00:00:00Z",
        }),
        project({ hidden: true, position: 1 }),
      ],
      tasks: [task({ id: "t2", title: "Review now", position: 0, created_at: "2026-01-02T00:00:00Z" })],
    });
  });

  it("replaces presence from server broadcasts and does not update it optimistically", () => {
    const { service, socket } = openService({
      projects: [project()],
      tasks: [task()],
    });
    const presenceEvents: Record<string, string>[] = [];
    service.subscribe((event) => {
      if (event.type === "presence") presenceEvents.push(event.editing);
    });

    service.setEditing("t1", "Taylor");
    expect(presenceEvents).toEqual([{}]);

    socket.emit({
      type: "presence",
      payload: { editing: { t1: "Taylor", t2: "Jordan" } },
    });
    socket.emit({
      type: "presence",
      payload: { editing: { t2: "Jordan" } },
    });

    expect(presenceEvents).toEqual([{}, { t1: "Taylor", t2: "Jordan" }, { t2: "Jordan" }]);
  });

  it("rejects pending work on disconnect, reconnects, and re-syncs from a fresh snapshot without replay", async () => {
    vi.useFakeTimers();

    const { service, socket } = openService({
      projects: [project()],
      tasks: [task()],
    });
    const statuses: string[] = [];
    const states: BoardState[] = [];
    service.subscribe((event) => {
      if (event.type === "status") statuses.push(event.status);
      if (event.type === "state") states.push(event.board);
    });

    socket.emit({
      type: "board_event",
      payload: { eventType: "project_created", project: project({ id: "p2", name: "Beta", position: 1 }) },
    });

    const pending = service.createProject("Gamma");
    expect(sentFrames(socket)).toHaveLength(1);

    socket.closeFromServer();

    await expect(pending).rejects.toThrow("Could not save changes");
    expect(service.getStatus()).toBe("reconnecting");
    expect(statuses.at(-1)).toBe("reconnecting");

    await vi.advanceTimersByTimeAsync(25);
    expect(FakeWebSocket.instances).toHaveLength(2);

    const replacementSocket = FakeWebSocket.instances[1]!;
    expect(sentFrames(replacementSocket)).toEqual([]);

    replacementSocket.open();
    replacementSocket.emit(
      snapshot({
        projects: [project({ id: "p3", name: "Gamma" })],
        tasks: [],
      }),
    );

    expect(service.getState()).toEqual({
      projects: [project({ id: "p3", name: "Gamma" })],
      tasks: [],
    });
    expect(states.at(-1)).toEqual({
      projects: [project({ id: "p3", name: "Gamma" })],
      tasks: [],
    });
  });

  it("escalates status to disconnected once offline past the threshold, then recovers on reconnect", async () => {
    vi.useFakeTimers();

    const service = new WebSocketBoardService("ws://example.test/ws", {
      reconnectDelayMs: 25,
      offlineThresholdMs: 100,
      webSocketFactory: factory,
    });
    const initialSocket = FakeWebSocket.instances.at(-1)!;
    initialSocket.open();
    initialSocket.emit(snapshot());

    const statuses: string[] = [];
    service.subscribe((event) => {
      if (event.type === "status") statuses.push(event.status);
    });

    initialSocket.closeFromServer();
    expect(service.getStatus()).toBe("reconnecting");

    // Reconnect attempts keep failing (the replacement sockets never open),
    // so after the offline threshold elapses the UI should lock down.
    await vi.advanceTimersByTimeAsync(100);
    expect(service.getStatus()).toBe("disconnected");
    expect(statuses).toContain("disconnected");

    const reconnectedSocket = FakeWebSocket.instances.at(-1)!;
    reconnectedSocket.open();
    expect(service.getStatus()).toBe("connected");
    expect(statuses.at(-1)).toBe("connected");
  });
});
