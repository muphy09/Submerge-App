import './ConfirmDialog.css';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  errorMessage?: string | null;
  isLoading?: boolean;
  hideCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  errorMessage = null,
  isLoading = false,
  hideCancel = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="confirm-backdrop" role="dialog" aria-modal="true">
      <div className="confirm-modal">
        <div className="confirm-header">
          <h3>{title}</h3>
        </div>
        <div className="confirm-body">
          {message ? <p>{message}</p> : null}
          {errorMessage && <div className="confirm-error">{errorMessage}</div>}
        </div>
        <div className="confirm-actions">
          {!hideCancel && (
            <button className="btn btn-secondary" onClick={onCancel} disabled={isLoading}>
              {cancelLabel}
            </button>
          )}
          <button className="btn btn-primary" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
