import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getBoardService } from "@/lib/board/service";
import type {
  BoardService,
  BoardState,
  ConnectionStatus,
} from "@/lib/board/types";

export function useBoard(service: BoardService = getBoardService()) {
  const [board, setBoard] = useState<BoardState>(() => service.getState());
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    service.getStatus(),
  );
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string[]>([]);
  const pendingRef = useRef<string[]>([]);

  useEffect(() => {
    return service.subscribe((event) => {
      if (event.type === "state") setBoard(event.board);
      else if (event.type === "status") setStatus(event.status);
      else setEditing(event.editing);
    });
  }, [service]);

  const track = useCallback(async <T,>(key: string, work: () => Promise<T>) => {
    pendingRef.current = [...pendingRef.current, key];
    setPending(pendingRef.current);
    try {
      return await work();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save changes");
      return undefined;
    } finally {
      pendingRef.current = pendingRef.current.filter((k) => k !== key);
      setPending(pendingRef.current);
    }
  }, []);

  const visibleProjects = useMemo(
    () => board.projects.filter((p) => !p.hidden),
    [board.projects],
  );
  const hiddenCount = board.projects.length - visibleProjects.length;

  const tasksFor = useCallback(
    (projectId: string, status: string) =>
      board.tasks.filter((t) => t.project_id === projectId && t.status === status),
    [board.tasks],
  );

  return {
    service,
    board,
    status,
    editing,
    pending,
    isPending: (key: string) => pending.includes(key),
    disabled: status === "disconnected",
    visibleProjects,
    hiddenCount,
    tasksFor,
    track,
  };
}
