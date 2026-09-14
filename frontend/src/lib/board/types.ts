export const STATUSES = ["todo", "doing", "done"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  todo: "To Do",
  doing: "Doing",
  done: "Done",
};

export const LIMITS = {
  projectName: 50,
  taskTitle: 100,
  assignee: 50,
  notes: 2000,
} as const;

export interface Project {
  id: string;
  name: string;
  position: number;
  hidden: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  assignee: string;
  notes: string;
  status: Status;
  position: number;
  created_at: string;
}

export interface BoardState {
  projects: Project[];
  tasks: Task[];
}

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

export type BoardEvent =
  | { type: "state"; board: BoardState }
  | { type: "status"; status: ConnectionStatus }
  | { type: "presence"; editing: Record<string, string> };

export interface CreateTaskInput {
  project_id: string;
  title: string;
  assignee: string;
  notes?: string;
}

export interface MoveTaskInput {
  taskId: string;
  project_id: string;
  status: Status;
  index: number;
}

/**
 * The single boundary between the UI and the backend.
 * Every backend call in the app goes through this interface.
 */
export interface BoardService {
  subscribe(listener: (event: BoardEvent) => void): () => void;
  getState(): BoardState;
  getStatus(): ConnectionStatus;

  createProject(name: string): Promise<Project>;
  renameProject(id: string, name: string): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  undoDeleteProject(id: string): Promise<void>;
  setProjectHidden(id: string, hidden: boolean): Promise<Project>;
  reorderProjects(orderedIds: string[]): Promise<void>;

  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(
    id: string,
    patch: Partial<Pick<Task, "title" | "assignee" | "notes">>,
  ): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  moveTask(input: MoveTaskInput): Promise<Task>;

  setEditing(taskId: string | null, displayName: string): void;
}

export class ValidationError extends Error {}
