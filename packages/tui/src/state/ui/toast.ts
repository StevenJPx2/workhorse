import { createSignal } from "solid-js";

export type ToastType = "error" | "success" | "info" | "warning";

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  timestamp: number;
}

const [toasts, setToasts] = createSignal<Toast[]>([]);
let toastId = 0;

export { toasts, setToasts };

/** Show a toast notification. Auto-dismisses after duration (default 5s). */
export function toast(
  type: ToastType,
  message: string,
  duration = 5000,
): number {
  const id = ++toastId;
  const t: Toast = { id, type, message, timestamp: Date.now() };
  setToasts((prev) => [...prev, t]);
  setTimeout(() => dismissToast(id), duration);
  return id;
}

/** Dismiss a toast by ID. */
export function dismissToast(id: number): void {
  setToasts((prev) => prev.filter((t) => t.id !== id));
}

/** Shorthand for error toast. */
export const showError = (message: string) => toast("error", message, 8000);

/** Shorthand for success toast. */
export const showSuccess = (message: string) => toast("success", message, 3000);
