import { create } from 'zustand';

interface SnackOptions {
  actionLabel?: string;
  onAction?: () => void;
  /** Called when the snackbar goes away WITHOUT the action being pressed. */
  onDismiss?: () => void;
}

interface SnackbarState {
  message: string | null;
  actionLabel?: string;
  _onAction?: () => void;
  _onDismiss?: () => void;
  show: (message: string, opts?: SnackOptions) => void;
  /** User pressed the action button. */
  act: () => void;
  /** Auto-timeout or manual close. */
  dismiss: () => void;
}

const cleared = { message: null, actionLabel: undefined, _onAction: undefined, _onDismiss: undefined };

export const useSnackbar = create<SnackbarState>((set, get) => ({
  message: null,
  show: (message, opts) => {
    // A snackbar replaced before it times out still "dismissed" without its
    // action - fire the old onDismiss so its cleanup (e.g. deleting a cover) runs.
    get()._onDismiss?.();
    set({
      message,
      actionLabel: opts?.actionLabel,
      _onAction: opts?.onAction,
      _onDismiss: opts?.onDismiss,
    });
  },
  act: () => {
    const fn = get()._onAction;
    set(cleared);
    fn?.();
  },
  dismiss: () => {
    const fn = get()._onDismiss;
    set(cleared);
    fn?.();
  },
}));
