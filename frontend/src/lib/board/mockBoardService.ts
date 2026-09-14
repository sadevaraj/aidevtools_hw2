import {
  LIMITS,
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

const STORAGE_KEY = "project-board.state.v1";
const CHANNEL = "project-board.sync.v1";

export interface MockOptions {
  /** Simulated round-trip latency in ms. */
  latency?: number;
  /** Persist to localStorage + sync across tabs. */
  persist?: boolean;
  seed?: BoardState;
  displayNameSuggestions?: string[];
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const emptyState = (): BoardState => ({ projects: [], tasks: [] });

function requireText(value: unknown, label: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ValidationError(`Invalid ${label}`);
  if (text.length > max) throw new ValidationError(`${label} is too long`);
  return text;
}

function optionalText(value: unknown, label: string, max: number): string {
  const text = typeof value === "string" ? value : "";
  if (text.length > max) throw new ValidationError(`${label} is too long`);
  return text;
}

export class MockBoardService implements BoardService {
  private state: BoardState;
  private status: ConnectionStatus = "connected";
  private listeners = new Set<(event: BoardEvent) => void>();
  private editing: Record<string, string> = {};
  private displayNameSuggestions: string[];
  private trash = new Map<string, { project: Project; tasks: Task[] }>();
  private latency: number;
  private persist: boolean;
  private channel: BroadcastChannel | null = null;

  constructor(options: MockOptions = {}) {
    this.latency = options.latency ?? 120;
    this.persist = options.persist ?? false;
    this.state = options.seed ?? this.load() ?? emptyState();
    this.displayNameSuggestions = [...(options.displayNameSuggestions ?? [])];

    if (this.persist && typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (event: MessageEvent<BoardState>) => {
        this.state = event.data;
        this.emit({ type: "state", board: this.snapshot() });
      };
    }
  }

  // ---- transport ----------------------------------------------------------

  subscribe(listener: (event: BoardEvent) => void) {
    this.listeners.add(listener);
    listener({ type: "status", status: this.status });
    listener({ type: "state", board: this.snapshot() });
    listener({ type: "presence", editing: { ...this.editing } });
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): BoardState {
    return this.snapshot();
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getDisplayNameSuggestions(): string[] {
    return [...this.displayNameSuggestions];
  }

  /** Test/dev helper — simulate the socket dropping. */
  setStatus(status: ConnectionStatus) {
    this.status = status;
    this.emit({ type: "status", status });
    if (status === "connected") {
      // Reconnect behaviour: push the full board state back to clients.
      this.emit({ type: "state", board: this.snapshot() });
    }
  }

  setEditing(taskId: string | null, displayName: string) {
    for (const [id, name] of Object.entries(this.editing)) {
      if (name === displayName) delete this.editing[id];
    }
    if (taskId) this.editing[taskId] = displayName;
    if (taskId) this.recordDisplayNameSuggestion(displayName);
    this.emit({ type: "presence", editing: { ...this.editing } });
  }

  private snapshot(): BoardState {
    return {
      projects: [...this.state.projects].sort((a, b) => a.position - b.position),
      tasks: [...this.state.tasks].sort((a, b) => a.position - b.position),
    };
  }

  private emit(event: BoardEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private load(): BoardState | null {
    if (!this.persist || typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as BoardState) : null;
    } catch {
      return null;
    }
  }

  private commit() {
    if (this.persist && typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.channel?.postMessage(this.state);
    }
    this.emit({ type: "state", board: this.snapshot() });
  }

  private async request<T>(work: () => T): Promise<T> {
    if (this.status === "disconnected") {
      throw new ValidationError("Could not save changes");
    }
    if (this.latency) await new Promise((r) => setTimeout(r, this.latency));
    const result = work();
    this.commit();
    return result;
  }

  // ---- projects -----------------------------------------------------------

  createProject(name: string) {
    return this.request(() => {
      const clean = requireText(name, "project name", LIMITS.projectName);
      const project: Project = {
        id: uid(),
        name: clean,
        position: this.state.projects.length,
        hidden: false,
        created_at: new Date().toISOString(),
      };
      this.state.projects.push(project);
      return project;
    });
  }

  renameProject(id: string, name: string) {
    return this.request(() => {
      const project = this.findProject(id);
      project.name = requireText(name, "project name", LIMITS.projectName);
      return project;
    });
  }

  deleteProject(id: string) {
    return this.request(() => {
      const project = this.findProject(id);
      const tasks = this.state.tasks.filter((t) => t.project_id === id);
      this.trash.set(id, { project, tasks });
      this.state.projects = this.state.projects.filter((p) => p.id !== id);
      this.state.tasks = this.state.tasks.filter((t) => t.project_id !== id);
    });
  }

  undoDeleteProject(id: string) {
    return this.request(() => {
      const entry = this.trash.get(id);
      if (!entry) throw new ValidationError("Nothing to undo");
      this.state.projects.push(entry.project);
      this.state.tasks.push(...entry.tasks);
      this.trash.delete(id);
    });
  }

  setProjectHidden(id: string, hidden: boolean) {
    return this.request(() => {
      const project = this.findProject(id);
      project.hidden = hidden;
      return project;
    });
  }

  reorderProjects(orderedIds: string[]) {
    return this.request(() => {
      orderedIds.forEach((id, index) => {
        const project = this.state.projects.find((p) => p.id === id);
        if (!project) throw new ValidationError("Invalid project");
        project.position = index;
      });
    });
  }

  // ---- tasks --------------------------------------------------------------

  createTask(input: CreateTaskInput) {
    return this.request(() => {
      this.findProject(input.project_id);
      const task: Task = {
        id: uid(),
        project_id: input.project_id,
        title: requireText(input.title, "task title", LIMITS.taskTitle),
        assignee: requireText(input.assignee, "assignee", LIMITS.assignee),
        notes: optionalText(input.notes, "notes", LIMITS.notes),
        status: "todo",
        position: this.columnTasks(input.project_id, "todo").length,
        created_at: new Date().toISOString(),
      };
      this.state.tasks.push(task);
      return task;
    });
  }

  updateTask(
    id: string,
    patch: Partial<Pick<Task, "title" | "assignee" | "notes">>,
  ) {
    return this.request(() => {
      const task = this.findTask(id);
      if (patch.title !== undefined)
        task.title = requireText(patch.title, "task title", LIMITS.taskTitle);
      if (patch.assignee !== undefined)
        task.assignee = requireText(patch.assignee, "assignee", LIMITS.assignee);
      if (patch.notes !== undefined)
        task.notes = optionalText(patch.notes, "notes", LIMITS.notes);
      return task;
    });
  }

  deleteTask(id: string) {
    return this.request(() => {
      this.findTask(id);
      this.state.tasks = this.state.tasks.filter((t) => t.id !== id);
    });
  }

  moveTask({ taskId, project_id, status, index }: MoveTaskInput) {
    return this.request(() => {
      const task = this.findTask(taskId);
      this.findProject(project_id);
      if (!STATUSES.includes(status)) throw new ValidationError("Invalid status");

      const target = this.columnTasks(project_id, status).filter(
        (t) => t.id !== taskId,
      );
      const source = this.columnTasks(task.project_id, task.status).filter(
        (t) => t.id !== taskId,
      );
      source.forEach((t, i) => (t.position = i));

      task.project_id = project_id;
      task.status = status;
      const bounded = Math.max(0, Math.min(index, target.length));
      target.splice(bounded, 0, task);
      target.forEach((t, i) => (t.position = i));
      return task;
    });
  }

  // ---- helpers ------------------------------------------------------------

  private columnTasks(projectId: string, status: Status) {
    return this.state.tasks
      .filter((t) => t.project_id === projectId && t.status === status)
      .sort((a, b) => a.position - b.position);
  }

  private findProject(id: string) {
    const project = this.state.projects.find((p) => p.id === id);
    if (!project) throw new ValidationError("Invalid project");
    return project;
  }

  private findTask(id: string) {
    const task = this.state.tasks.find((t) => t.id === id);
    if (!task) throw new ValidationError("Invalid task");
    return task;
  }

  private recordDisplayNameSuggestion(displayName: string) {
    let clean: string;
    try {
      clean = requireText(displayName, "assignee", LIMITS.assignee);
    } catch {
      return;
    }

    const normalized = clean.toLowerCase();
    this.displayNameSuggestions = this.displayNameSuggestions
      .filter((name) => name.trim().toLowerCase() !== normalized)
      .slice(0, 19);
    this.displayNameSuggestions.unshift(clean);
  }
}
