import {
  STATUSES,
  ValidationError,
  type BoardEvent,
  type BoardService,
  type BoardState,
  type ConnectionStatus,
  type CreateTaskInput,
  type MoveTaskInput,
  type Project,
  type Status,
  type Task,
} from "./types";

type ClientCommandType =
  | "create_project"
  | "rename_project"
  | "delete_project"
  | "undo_delete_project"
  | "set_project_hidden"
  | "reorder_projects"
  | "create_task"
  | "update_task"
  | "delete_task"
  | "move_task"
  | "set_editing";

type WebSocketState = Pick<
  WebSocket,
  "readyState" | "send" | "close" | "onopen" | "onmessage" | "onerror" | "onclose"
>;

type WebSocketFactory = (url: string) => WebSocketState;

interface PendingRequest<T> {
  mapResult: (payload: Record<string, unknown>) => T;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

type CommandFrame = {
  type: ClientCommandType;
  requestId: string;
  payload: Record<string, unknown>;
};

type ServerFrame =
  | {
      type: "snapshot";
      payload: { board: BoardState; displayNameSuggestions?: string[] };
    }
  | { type: "board_event"; payload: Record<string, unknown> }
  | { type: "presence"; payload: { editing: Record<string, string> } }
  | { type: "command_ok"; requestId: string; payload: Record<string, unknown> }
  | {
      type: "command_error";
      requestId: string;
      payload: { code: string; message: string };
    };

const STATUS_ORDER = new Map<Status, number>(STATUSES.map((status, index) => [status, index]));
const WS_CONNECTING = 0;
const WS_OPEN = 1;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const emptyState = (): BoardState => ({ projects: [], tasks: [] });

const cloneProject = (project: Project): Project => ({ ...project });
const cloneTask = (task: Task): Task => ({ ...task });

function normalizeBoard(board: BoardState): BoardState {
  return {
    projects: [...board.projects]
      .map(cloneProject)
      .sort(
        (a, b) =>
          a.position - b.position ||
          a.created_at.localeCompare(b.created_at) ||
          a.id.localeCompare(b.id),
      ),
    tasks: [...board.tasks]
      .map(cloneTask)
      .sort(
        (a, b) =>
          a.project_id.localeCompare(b.project_id) ||
          (STATUS_ORDER.get(a.status) ?? 0) - (STATUS_ORDER.get(b.status) ?? 0) ||
          a.position - b.position ||
          a.created_at.localeCompare(b.created_at) ||
          a.id.localeCompare(b.id),
      ),
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asProject(value: unknown): Project | null {
  const project = asObject(value);
  if (!project) return null;
  if (
    typeof project.id !== "string" ||
    typeof project.name !== "string" ||
    typeof project.position !== "number" ||
    typeof project.hidden !== "boolean" ||
    typeof project.created_at !== "string"
  ) {
    return null;
  }
  return project as unknown as Project;
}

function asTask(value: unknown): Task | null {
  const task = asObject(value);
  if (!task) return null;
  if (
    typeof task.id !== "string" ||
    typeof task.project_id !== "string" ||
    typeof task.title !== "string" ||
    typeof task.assignee !== "string" ||
    typeof task.notes !== "string" ||
    typeof task.status !== "string" ||
    typeof task.position !== "number" ||
    typeof task.created_at !== "string"
  ) {
    return null;
  }
  if (!STATUSES.includes(task.status as Status)) return null;
  return task as unknown as Task;
}

function asBoardState(value: unknown): BoardState | null {
  const board = asObject(value);
  if (!board || !Array.isArray(board.projects) || !Array.isArray(board.tasks)) return null;

  const projects = board.projects.map(asProject);
  const tasks = board.tasks.map(asTask);
  if (projects.some((project) => !project) || tasks.some((task) => !task)) return null;

  return normalizeBoard({
    projects: projects as Project[],
    tasks: tasks as Task[],
  });
}

function isSocketOpen(socket: WebSocketState | null): socket is WebSocketState {
  return socket?.readyState === WS_OPEN;
}

function asDisplayNameSuggestions(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return [...value];
}

export interface WebSocketBoardServiceOptions {
  reconnectDelayMs?: number;
  webSocketFactory?: WebSocketFactory;
  /**
   * How long the connection may stay in "reconnecting" before the UI is
   * considered offline and locked down (status escalates to "disconnected").
   * Defaults to 4x the reconnect delay so a couple of retry attempts get a
   * chance to succeed before the UI disables editing/creation/dragging.
   */
  offlineThresholdMs?: number;
}

export class WebSocketBoardService implements BoardService {
  private readonly listeners = new Set<(event: BoardEvent) => void>();
  private readonly pending = new Map<string, PendingRequest<unknown>>();
  private readonly reconnectDelayMs: number;
  private readonly offlineThresholdMs: number;
  private readonly webSocketFactory: WebSocketFactory;

  private socket: WebSocketState | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private offlineTimer: ReturnType<typeof setTimeout> | null = null;
  private state: BoardState = emptyState();
  private displayNameSuggestions: string[] = [];
  private editing: Record<string, string> = {};
  private status: ConnectionStatus = "reconnecting";

  constructor(
    private readonly url: string,
    options: WebSocketBoardServiceOptions = {},
  ) {
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1000;
    this.offlineThresholdMs = options.offlineThresholdMs ?? this.reconnectDelayMs * 4;
    this.webSocketFactory =
      options.webSocketFactory ?? ((socketUrl) => new WebSocket(socketUrl));
    this.connect();
  }

  subscribe(listener: (event: BoardEvent) => void) {
    this.listeners.add(listener);
    listener({ type: "status", status: this.status });
    listener({ type: "state", board: this.getState() });
    listener({ type: "presence", editing: { ...this.editing } });
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): BoardState {
    return normalizeBoard(this.state);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getDisplayNameSuggestions(): string[] {
    return [...this.displayNameSuggestions];
  }

  createProject(name: string): Promise<Project> {
    return this.sendCommand("create_project", { name }, (payload) => {
      const project = asProject(payload.project);
      if (!project) throw new ValidationError("Could not save changes");
      return project;
    });
  }

  renameProject(id: string, name: string): Promise<Project> {
    return this.sendCommand("rename_project", { id, name }, (payload) => {
      const project = asProject(payload.project);
      if (!project) throw new ValidationError("Could not save changes");
      return project;
    });
  }

  deleteProject(id: string): Promise<void> {
    return this.sendCommand("delete_project", { id }, () => undefined);
  }

  undoDeleteProject(id: string): Promise<void> {
    return this.sendCommand("undo_delete_project", { id }, () => undefined);
  }

  setProjectHidden(id: string, hidden: boolean): Promise<Project> {
    return this.sendCommand("set_project_hidden", { id, hidden }, (payload) => {
      const project = asProject(payload.project);
      if (!project) throw new ValidationError("Could not save changes");
      return project;
    });
  }

  reorderProjects(orderedIds: string[]): Promise<void> {
    return this.sendCommand("reorder_projects", { orderedIds }, () => undefined);
  }

  createTask(input: CreateTaskInput): Promise<Task> {
    const payload: Record<string, unknown> = {
      project_id: input.project_id,
      title: input.title,
      assignee: input.assignee,
    };
    if (input.notes !== undefined) payload.notes = input.notes;
    return this.sendCommand("create_task", payload, (response) => {
      const task = asTask(response.task);
      if (!task) throw new ValidationError("Could not save changes");
      return task;
    });
  }

  updateTask(
    id: string,
    patch: Partial<Pick<Task, "title" | "assignee" | "notes">>,
  ): Promise<Task> {
    return this.sendCommand("update_task", { id, patch }, (payload) => {
      const task = asTask(payload.task);
      if (!task) throw new ValidationError("Could not save changes");
      return task;
    });
  }

  deleteTask(id: string): Promise<void> {
    return this.sendCommand("delete_task", { id }, () => undefined);
  }

  moveTask(input: MoveTaskInput): Promise<Task> {
    return this.sendCommand("move_task", input as unknown as Record<string, unknown>, (payload) => {
      const task = asTask(payload.task);
      if (!task) throw new ValidationError("Could not save changes");
      return task;
    });
  }

  setEditing(taskId: string | null, displayName: string): void {
    if (!isSocketOpen(this.socket)) return;
    const frame: CommandFrame = {
      type: "set_editing",
      requestId: uid(),
      payload: { taskId, displayName },
    };
    try {
      this.socket.send(JSON.stringify(frame));
    } catch {
      this.handleDisconnect(this.socket);
    }
  }

  private connect() {
    if (this.socket && this.socket.readyState === WS_CONNECTING) return;
    if (isSocketOpen(this.socket)) return;

    try {
      const socket = this.webSocketFactory(this.url);
      this.socket = socket;
      socket.onopen = () => {
        if (this.socket !== socket) return;
        this.clearReconnectTimer();
        this.clearOfflineTimer();
        this.setStatus("connected");
      };
      socket.onmessage = (event) => {
        if (this.socket !== socket) return;
        this.handleMessage(event.data);
      };
      socket.onerror = () => {
        this.handleDisconnect(socket);
      };
      socket.onclose = () => {
        this.handleDisconnect(socket);
      };
    } catch {
      this.handleDisconnect(this.socket);
    }
  }

  private handleMessage(raw: unknown) {
    let parsed: unknown = raw;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
    }

    const message = asObject(parsed) as ServerFrame | null;
    if (!message || typeof message.type !== "string") return;

    switch (message.type) {
      case "snapshot": {
        const board = asBoardState(message.payload?.board);
        const displayNameSuggestions = asDisplayNameSuggestions(
          message.payload?.displayNameSuggestions,
        );
        if (!board || displayNameSuggestions === null) return;
        this.state = board;
        this.displayNameSuggestions = displayNameSuggestions;
        this.emit({ type: "state", board: this.getState() });
        return;
      }
      case "board_event":
        this.applyBoardEvent(message.payload);
        return;
      case "presence": {
        const editing =
          message.payload && typeof message.payload.editing === "object"
            ? { ...(message.payload.editing as Record<string, string>) }
            : {};
        this.editing = editing;
        this.emit({ type: "presence", editing: { ...this.editing } });
        return;
      }
      case "command_ok": {
        if (typeof message.requestId !== "string") return;
        const pending = this.pending.get(message.requestId);
        if (!pending) return;
        this.pending.delete(message.requestId);
        try {
          pending.resolve(pending.mapResult(asObject(message.payload) ?? {}));
        } catch (error) {
          pending.reject(error);
        }
        return;
      }
      case "command_error": {
        if (typeof message.requestId !== "string") return;
        const pending = this.pending.get(message.requestId);
        if (!pending) return;
        this.pending.delete(message.requestId);
        pending.reject(
          new ValidationError(
            typeof message.payload?.message === "string"
              ? message.payload.message
              : "Could not save changes",
          ),
        );
      }
    }
  }

  private applyBoardEvent(payload: Record<string, unknown>) {
    const eventType = typeof payload.eventType === "string" ? payload.eventType : null;
    if (!eventType) return;

    switch (eventType) {
      case "project_created":
      case "project_renamed":
      case "project_restored":
      case "project_hidden_set": {
        const project = asProject(payload.project);
        if (!project) return;
        this.upsertProject(project);
        break;
      }
      case "project_deleted": {
        const project = asProject(payload.project);
        if (!project) return;
        this.state = normalizeBoard({
          projects: this.state.projects.filter((item) => item.id !== project.id),
          tasks: this.state.tasks.filter((task) => task.project_id !== project.id),
        });
        break;
      }
      case "projects_reordered": {
        if (!Array.isArray(payload.orderedIds)) return;
        const positions = new Map<string, number>();
        payload.orderedIds.forEach((id, index) => {
          if (typeof id === "string") positions.set(id, index);
        });
        this.state = normalizeBoard({
          projects: this.state.projects.map((project) =>
            positions.has(project.id)
              ? { ...project, position: positions.get(project.id)! }
              : cloneProject(project),
          ),
          tasks: this.state.tasks,
        });
        break;
      }
      case "task_created":
      case "task_updated": {
        const task = asTask(payload.task);
        if (!task) return;
        this.upsertTask(task);
        break;
      }
      case "task_deleted": {
        const task = asTask(payload.task);
        if (!task) return;
        this.state = normalizeBoard({
          projects: this.state.projects,
          tasks: this.state.tasks.filter((item) => item.id !== task.id),
        });
        break;
      }
      case "task_moved": {
        const task = asTask(payload.task);
        if (!task) return;
        this.reduceTaskMove(task);
        break;
      }
      default:
        return;
    }

    this.emit({ type: "state", board: this.getState() });
  }

  private reduceTaskMove(task: Task) {
    const previous = this.state.tasks.find((item) => item.id === task.id);
    const sourceProjectId = previous?.project_id ?? task.project_id;
    const sourceStatus = previous?.status ?? task.status;
    const sameColumn = sourceProjectId === task.project_id && sourceStatus === task.status;

    const tasks = this.state.tasks
      .filter((item) => item.id !== task.id)
      .map(cloneTask);
    const moved = cloneTask(task);

    if (!sameColumn) {
      const sourceTasks = tasks.filter(
        (item) => item.project_id === sourceProjectId && item.status === sourceStatus,
      );
      sourceTasks.forEach((item, index) => {
        item.position = index;
      });
    }

    const targetTasks = tasks.filter(
      (item) => item.project_id === task.project_id && item.status === task.status,
    );
    const orderedTargetTasks = [...targetTasks];
    const targetIndex = Math.max(0, Math.min(task.position, orderedTargetTasks.length));
    orderedTargetTasks.splice(targetIndex, 0, moved);
    orderedTargetTasks.forEach((item, index) => {
      item.position = index;
    });

    this.state = normalizeBoard({
      projects: this.state.projects,
      tasks: [...tasks, moved],
    });
  }

  private upsertProject(project: Project) {
    const projects = this.state.projects
      .filter((item) => item.id !== project.id)
      .map(cloneProject);
    projects.push(cloneProject(project));
    this.state = normalizeBoard({ projects, tasks: this.state.tasks });
  }

  private upsertTask(task: Task) {
    const tasks = this.state.tasks.filter((item) => item.id !== task.id).map(cloneTask);
    tasks.push(cloneTask(task));
    this.state = normalizeBoard({ projects: this.state.projects, tasks });
  }

  private sendCommand<T>(
    type: ClientCommandType,
    payload: Record<string, unknown>,
    mapResult: (payload: Record<string, unknown>) => T,
  ): Promise<T> {
    const socket = this.socket;
    if (!isSocketOpen(socket)) {
      return Promise.reject(new ValidationError("Could not save changes"));
    }

    const requestId = uid();
    const frame: CommandFrame = { type, requestId, payload };

    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { mapResult, resolve, reject });
      try {
        socket.send(JSON.stringify(frame));
      } catch {
        this.pending.delete(requestId);
        reject(new ValidationError("Could not save changes"));
        this.handleDisconnect(socket);
      }
    });
  }

  private handleDisconnect(socket: WebSocketState | null) {
    if (socket && this.socket !== socket) return;

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
    }
    this.socket = null;

    if (Object.keys(this.editing).length > 0) {
      this.editing = {};
      this.emit({ type: "presence", editing: {} });
    }

    if (this.pending.size > 0) {
      const error = new ValidationError("Could not save changes");
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    }

    this.setStatus("reconnecting");
    this.scheduleOfflineTimer();
    this.scheduleReconnect();
  }

  private scheduleOfflineTimer() {
    if (this.offlineTimer) return;
    this.offlineTimer = setTimeout(() => {
      this.offlineTimer = null;
      if (this.status !== "connected") this.setStatus("disconnected");
    }, this.offlineThresholdMs);
  }

  private clearOfflineTimer() {
    if (!this.offlineTimer) return;
    clearTimeout(this.offlineTimer);
    this.offlineTimer = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.emit({ type: "status", status });
  }

  private emit(event: BoardEvent) {
    for (const listener of this.listeners) listener(event);
  }
}
