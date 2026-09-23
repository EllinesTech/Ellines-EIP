'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { getOperation, operationRequiresReason, operationRequiresConfirmation } from '@ellines-eip/shared';
import styles from './confirm-dialog.module.css';

export interface ConfirmDialogProps {
  /** Operation ID from the operation registry. */
  operationId: string;
  /** Whether the dialog is open. */
  open: boolean;
  /** Callback when user confirms with reason. */
  onConfirm: (reason: string) => void | Promise<void>;
  /** Callback when user cancels. */
  onCancel: () => void;
  /** Optional custom title override. */
  title?: string;
  /** Optional custom description override. */
  description?: string;
  /** Optional additional context (e.g., item name being operated on). */
  context?: string;
  /** Optional dry-run flag for operations that support it. */
  dryRun?: boolean;
}

export function ConfirmDialog({
  operationId,
  open,
  onConfirm,
  onCancel,
  title,
  description,
  context,
  dryRun = false,
}: ConfirmDialogProps) {
  const op = getOperation(operationId);
  const needsReason = op ? operationRequiresReason(operationId) : true;
  const needsConfirmation = op ? operationRequiresConfirmation(operationId) : true;
  const supportsDryRun = op ? op.dryRun === true : dryRun;

  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDryRun, setShowDryRun] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setShowDryRun(false);
      // Focus the textarea on open
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needsReason && !reason.trim()) {
      setError('A reason is required for this operation.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setReason('');
    setError(null);
    onCancel();
  };

  if (!open) return null;

  const effectiveTitle = title || `Confirm ${op?.label || 'Operation'}`;
  const effectiveDescription = description || op?.safeguards.description || 'This operation requires confirmation.';

  return (
    <div className={styles.overlay} onClick={handleCancel} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 id="confirm-title" className={styles.title}>{effectiveTitle}</h3>
          <button className={styles.closeBtn} onClick={handleCancel} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={styles.content}>
          <p className={styles.description}>{effectiveDescription}</p>
          {context && <p className={styles.context}>Context: <strong>{context}</strong></p>}
          {op && (
            <div className={styles.safeguards}>
              <span className={styles.badge}>{op.operationClass}</span>
              <ul>
                {op.safeguards.safeguards.map((s) => (
                  <li key={s}>{s.replace(/_/g, ' ')}</li>
                ))}
              </ul>
            </div>
          )}
          <form onSubmit={handleSubmit}>
            {needsReason && (
              <div className={styles.field}>
                <label htmlFor="reason" className={styles.label}>
                  Reason <span className={styles.required}>*</span>
                </label>
                <textarea
                  ref={textareaRef}
                  id="reason"
                  className={styles.textarea}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={op?.reasonPlaceholder || 'Enter reason for this operation...'}
                  rows={4}
                  required
                  disabled={isSubmitting}
                />
                {error && <p className={styles.error}>{error}</p>}
              </div>
            )}
            {supportsDryRun && !showDryRun && (
              <button
                type="button"
                className={styles.dryRunBtn}
                onClick={() => setShowDryRun(true)}
                disabled={isSubmitting}
              >
                Try dry-run first
              </button>
            )}
            {supportsDryRun && showDryRun && (
              <div className={styles.dryRunNotice}>
                Dry-run mode: simulates the operation without making changes. Uncheck to execute for real.
                <label className={styles.dryRunCheckbox}>
                  <input
                    type="checkbox"
                    checked={showDryRun}
                    onChange={(e) => setShowDryRun(e.target.checked)}
                    disabled={isSubmitting}
                  />
                  Execute dry-run
                </label>
              </div>
            )}
            <div className={styles.actions}>
              <button type="button" className={styles.cancelBtn} onClick={handleCancel} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className={styles.confirmBtn} disabled={isSubmitting}>
                {isSubmitting ? 'Processing…' : 'Confirm'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Removed: a `useSafeguardedAction` hook previously lived here. The platform control
 * plane renders `<ConfirmDialog>` with explicit state instead, so that dialog state
 * survives parent re-renders (a fresh render-prop component identity each render would
 * remount the dialog and drop the typed reason). Reinstate only with a real consumer.
 */