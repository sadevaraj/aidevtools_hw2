import { Plus, LayoutGrid } from "lucide-react";
import type { ConnectionStatus } from "@/lib/board/types";

const STATUS_META: Record<ConnectionStatus, { label: string; color: string }> = {
  connected: { label: "Connected", color: "var(--success)" },
  reconnecting: { label: "Reconnecting", color: "var(--warning)" },
  disconnected: { label: "Disconnected", color: "var(--danger)" },
};

interface Props {
  status: ConnectionStatus;
  displayName: string;
  disabled: boolean;
  onNewProject: () => void;
  onNewTask: () => void;
  onChangeName: () => void;
}

export function BoardHeader({
  status,
  displayName,
  disabled,
  onNewProject,
  onNewTask,
  onChangeName,
}: Props) {
  const meta = STATUS_META[status];
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-6 py-3">
        <LayoutGrid className="size-5 text-primary" />
        <h1 className="text-base font-semibold text-foreground">Project Board</h1>

        <div className="ml-4 flex items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={onNewProject}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-40"
          >
            <Plus className="size-4" /> New Project
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onNewTask}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            <Plus className="size-4" /> New Task
          </button>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: meta.color }}
              aria-hidden
            />
            {meta.label}
          </span>
          <button
            type="button"
            onClick={onChangeName}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent"
          >
            {displayName}
          </button>
        </div>
      </div>
    </header>
  );
}
