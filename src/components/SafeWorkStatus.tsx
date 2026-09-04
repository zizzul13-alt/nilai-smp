import type { UiWorkState } from '../domain/safeWork';

const labels: Record<UiWorkState, string> = {
  TRANSIENT: 'Belum aman', PENDING_SAFE: 'Pending locally', SAVED: 'Saved', FAILED: 'Needs attention', CONFLICT: 'Conflict'
};

export function SafeWorkStatus({ state }: { state: UiWorkState }) {
  return <span className={`safe-work-status safe-work-status--${state.toLowerCase()}`} role="status" aria-live="polite">{labels[state]}</span>;
}
