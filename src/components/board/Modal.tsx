import type { ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  onClose?: () => void;
  children: ReactNode;
}

export function Modal({ open, title, onClose, children }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export const fieldClass =
  "w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary";
export const labelClass =
  "mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground";
export const primaryButtonClass =
  "inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40";
