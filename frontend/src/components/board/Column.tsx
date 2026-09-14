import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { ReactNode } from "react";
import { STATUS_LABELS, type Status } from "@/lib/board/types";

export const columnId = (projectId: string, status: Status) =>
  `col:${projectId}:${status}`;

interface Props {
  projectId: string;
  status: Status;
  taskIds: string[];
  children: ReactNode;
}

export function Column({ projectId, status, taskIds, children }: Props) {
  const id = columnId(projectId, status);
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: "column", projectId, status },
  });

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {STATUS_LABELS[status]}
        </h3>
        <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
          {taskIds.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        data-testid={id}
        className={`flex min-h-24 flex-col gap-2 rounded-md border border-dashed p-2 transition-colors ${
          isOver ? "border-primary bg-primary/5" : "border-border/70"
        }`}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </div>
    </div>
  );
}
