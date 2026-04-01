import { useEffect, useRef, useState } from 'react';
import {
  ADMIN_PANEL_PIN_LENGTH,
  MAX_ADMIN_PANEL_PIN_LENGTH,
  sanitizeAdminPanelPinInput,
} from '../services/adminPanelPin';
import './AdminPinModal.css';

interface AdminPinModalProps {
  isOpen: boolean;
  pin: string;
  error?: string;
  statusMessage?: string;
  isDisabled?: boolean;
  onPinChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

function AdminPinModal({
  isOpen,
  pin,
  error = '',
  statusMessage = '',
  isDisabled = false,
  onPinChange,
  onSubmit,
  onClose,
}: AdminPinModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowPin(false);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="admin-pin-backdrop" onClick={onClose}>
      <div
        className="admin-pin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-pin-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-pin-banner">
          <div className="admin-pin-banner__eyebrow">Protected Access</div>
          <h2 id="admin-pin-title">Enter the Admin PIN</h2>
        </div>

        <form
          className="admin-pin-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label className="admin-pin-label" htmlFor="admin-pin-input">
            Admin PIN
          </label>
          <div className="admin-pin-input-row">
            <input
              ref={inputRef}
              id="admin-pin-input"
              className="admin-pin-input"
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={MAX_ADMIN_PANEL_PIN_LENGTH}
              value={pin}
              onChange={(event) => onPinChange(sanitizeAdminPanelPinInput(event.target.value))}
              disabled={isDisabled}
            />
            <button
              type="button"
              className="admin-pin-toggle"
              onClick={() => setShowPin((current) => !current)}
              disabled={isDisabled}
            >
              {showPin ? 'Hide' : 'Show'}
            </button>
          </div>

          {error && (
            <div className="admin-pin-error" role="alert">
              {error}
            </div>
          )}

          {!error && statusMessage && <div className="admin-pin-status">{statusMessage}</div>}

          <div className="admin-pin-actions">
            <button type="button" className="admin-pin-button admin-pin-button--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="admin-pin-button admin-pin-button--primary"
              disabled={pin.length !== ADMIN_PANEL_PIN_LENGTH || isDisabled}
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminPinModal;
