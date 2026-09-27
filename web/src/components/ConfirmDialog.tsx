export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div class="modal-backdrop" onClick={onCancel}>
      <div class="modal glass confirm" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p class="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          {message}
        </p>
        <div class="modal-actions">
          <button type="button" class="btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            class={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
