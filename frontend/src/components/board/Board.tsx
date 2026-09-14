import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { BoardHeader } from "./BoardHeader";
import { ProjectSection } from "./ProjectSection";
import { TaskCard } from "./TaskCard";
import { Modal, fieldClass, labelClass, primaryButtonClass } from "./Modal";
import { useBoard } from "@/hooks/useBoard";
import { useDisplayName } from "@/hooks/useDisplayName";
import { reorder, resolveTaskDrop, type DropTarget } from "@/lib/board/dnd";
import { LIMITS, type Status, type Task } from "@/lib/board/types";

export function Board() {
  const {
    service,
    board,
    displayNameSuggestions,
    status,
    editing,
    isPending,
    disabled,
    visibleProjects,
    hiddenCount,
    tasksFor,
    track,
  } = useBoard();
  const { name, ready, save } = useDisplayName();

  const [nameOpen, setNameOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const tasksById = useMemo(
    () => new Map(board.tasks.map((t) => [t.id, t])),
    [board.tasks],
  );

  const needsName = ready && !name;
  const displayName = name ?? "Guest";

  const expand = (id: string | null) => {
    setExpanded(id);
    service.setEditing(id, displayName);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.["task"] as Task | undefined;
    setDragging(task ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setDragging(null);
    const { active, over } = event;
    if (!over || disabled) return;

    if (active.data.current?.["type"] === "project") {
      const ids = visibleProjects.map((p) => p.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from === -1 || to === -1 || from === to) return;
      const ordered = reorder(ids, from, to);
      await track(`project:${active.id}`, () => service.reorderProjects(ordered));
      return;
    }

    const task = tasksById.get(String(active.id));
    if (!task) return;

    const overData = over.data.current as
      | { type?: string; projectId?: string; status?: Status; task?: Task }
      | undefined;

    let target: DropTarget | null = null;
    if (overData?.type === "column" && overData.projectId && overData.status) {
      target = { type: "column", projectId: overData.projectId, status: overData.status };
    } else if (overData?.type === "task" && overData.task) {
      target = {
        type: "task",
        projectId: overData.task.project_id,
        status: overData.task.status,
        taskId: overData.task.id,
      };
    }
    if (!target) return;

    const move = resolveTaskDrop(task, target, board.tasks);
    if (!move) return;
    await track(`task:${task.id}`, () => service.moveTask(move));
  };

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-background">
      <BoardHeader
        status={status}
        displayName={displayName}
        disabled={disabled}
        onNewProject={() => setProjectOpen(true)}
        onNewTask={() => setTaskOpen(true)}
        onChangeName={() => setNameOpen(true)}
      />

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        {disabled && (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Disconnected — editing is paused while we reconnect.
          </p>
        )}

        {board.projects.length === 0 ? (
          <div className="mt-24 text-center">
            <p className="text-sm text-muted-foreground">No projects yet.</p>
            <button
              type="button"
              onClick={() => setProjectOpen(true)}
              className={`mt-4 ${primaryButtonClass}`}
            >
              Create your first project
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleProjects.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-5">
                {visibleProjects.map((project) => (
                  <ProjectSection
                    key={project.id}
                    project={project}
                    tasksFor={tasksFor as (p: string, s: Status) => Task[]}
                    disabled={disabled}
                    onRename={(next) =>
                      track(`project:${project.id}`, () =>
                        service.renameProject(project.id, next),
                      )
                    }
                    onHide={() =>
                      track(`project:${project.id}`, () =>
                        service.setProjectHidden(project.id, true),
                      )
                    }
                    onDelete={async () => {
                      await track(`project:${project.id}`, () =>
                        service.deleteProject(project.id),
                      );
                      toast("Project deleted", {
                        action: {
                          label: "Undo",
                          onClick: () => void service.undoDeleteProject(project.id),
                        },
                        duration: 6000,
                      });
                    }}
                    renderTask={(task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        expanded={expanded === task.id}
                        {...(editing[task.id] && editing[task.id] !== displayName
                          ? { editingBy: editing[task.id] }
                          : {})}
                        saving={isPending(`task:${task.id}`)}
                        disabled={disabled}
                        onExpand={expand}
                        onSave={(patch) =>
                          track(`task:${task.id}`, () =>
                            service.updateTask(task.id, patch),
                          )
                        }
                        onDelete={async () => {
                          expand(null);
                          await track(`task:${task.id}`, () =>
                            service.deleteTask(task.id),
                          );
                        }}
                      />
                    )}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {dragging && (
                <div className="rounded-md border border-primary bg-card p-3 shadow-xl">
                  <p className="text-sm text-foreground">{dragging.title}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{dragging.assignee}</p>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() =>
              board.projects
                .filter((p) => p.hidden)
                .forEach((p) =>
                  track(`project:${p.id}`, () => service.setProjectHidden(p.id, false)),
                )
            }
            className="mt-6 text-xs text-muted-foreground underline hover:text-foreground"
          >
            Show {hiddenCount} hidden project{hiddenCount > 1 ? "s" : ""}
          </button>
        )}
      </main>

      <NameModal
        open={needsName || nameOpen}
        initial={name ?? ""}
        suggestions={displayNameSuggestions}
        dismissible={!needsName}
        onClose={() => setNameOpen(false)}
        onSave={(value) => {
          save(value);
          setNameOpen(false);
        }}
      />

      <NewProjectModal
        open={projectOpen}
        onClose={() => setProjectOpen(false)}
        onCreate={async (value) => {
          setProjectOpen(false);
          await track("new-project", () => service.createProject(value));
        }}
      />

      <NewTaskModal
        key={displayName}
        open={taskOpen}
        projects={board.projects.map((p) => ({ id: p.id, name: p.name }))}
        defaultAssignee={displayName}
        onClose={() => setTaskOpen(false)}
        onCreate={async (input) => {
          setTaskOpen(false);
          await track("new-task", () => service.createTask(input));
        }}
      />
    </div>
  );
}

function NameModal({
  open,
  initial,
  suggestions,
  dismissible,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: string;
  suggestions: string[];
  dismissible: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const suggestionListId = "display-name-suggestions";
  return (
    <Modal
      open={open}
      title="Display name"
      {...(dismissible ? { onClose } : {})}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSave(value);
        }}
      >
        <label className={labelClass} htmlFor="display-name">
          Your name
        </label>
        <input
          id="display-name"
          autoFocus
          maxLength={50}
          list={suggestions.length > 0 ? suggestionListId : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Devaraj"
          className={fieldClass}
        />
        {suggestions.length > 0 && (
          <datalist id={suggestionListId}>
            {suggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        )}
        <button type="submit" disabled={!value.trim()} className={`mt-4 w-full ${primaryButtonClass}`}>
          Continue
        </button>
      </form>
    </Modal>
  );
}

function NewProjectModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <Modal open={open} title="New project" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onCreate(name);
          setName("");
        }}
      >
        <label className={labelClass} htmlFor="project-name">
          Project name
        </label>
        <input
          id="project-name"
          autoFocus
          maxLength={LIMITS.projectName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={fieldClass}
        />
        <button type="submit" disabled={!name.trim()} className={`mt-4 w-full ${primaryButtonClass}`}>
          Create project
        </button>
      </form>
    </Modal>
  );
}

function NewTaskModal({
  open,
  projects,
  defaultAssignee,
  onClose,
  onCreate,
}: {
  open: boolean;
  projects: { id: string; name: string }[];
  defaultAssignee: string;
  onClose: () => void;
  onCreate: (input: {
    project_id: string;
    title: string;
    assignee: string;
    notes: string;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(defaultAssignee);
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");

  const selected = projectId || projects[0]?.id || "";

  return (
    <Modal open={open} title="New task" onClose={onClose}>
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Create a project first.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || !assignee.trim() || !selected) return;
            onCreate({ project_id: selected, title, assignee, notes });
            setTitle("");
            setNotes("");
          }}
        >
          <label className={labelClass} htmlFor="task-title">Title</label>
          <input
            id="task-title"
            autoFocus
            maxLength={LIMITS.taskTitle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={fieldClass}
          />
          <label className={`${labelClass} mt-3`} htmlFor="task-assignee">Assignee</label>
          <input
            id="task-assignee"
            maxLength={LIMITS.assignee}
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className={fieldClass}
          />
          <label className={`${labelClass} mt-3`} htmlFor="task-project">Project</label>
          <select
            id="task-project"
            value={selected}
            onChange={(e) => setProjectId(e.target.value)}
            className={fieldClass}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className={`${labelClass} mt-3`} htmlFor="task-notes">Notes (optional)</label>
          <textarea
            id="task-notes"
            rows={3}
            maxLength={LIMITS.notes}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={fieldClass}
          />
          <button
            type="submit"
            disabled={!title.trim() || !assignee.trim()}
            className={`mt-4 w-full ${primaryButtonClass}`}
          >
            Create task
          </button>
        </form>
      )}
    </Modal>
  );
}
