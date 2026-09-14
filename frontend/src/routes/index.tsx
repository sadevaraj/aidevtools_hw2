import { createFileRoute } from "@tanstack/react-router";
import { Board } from "@/components/board/Board";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Project Board — Simple Real-Time Kanban for Small Teams" },
      {
        name: "description",
        content:
          "A lightweight shared kanban board: create projects, assign tasks, and drag work through To Do, Doing and Done.",
      },
      { property: "og:title", content: "Project Board — Simple Real-Time Kanban" },
      {
        property: "og:description",
        content:
          "A lightweight shared kanban board for small engineering teams. No setup, no accounts, no process overhead.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Board,
});
