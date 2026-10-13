"use client";

import { useEffect, useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

/**
 * Two-phase confirm for destructive admin actions: the first click arms the
 * control (focus moves to the confirm button), the second click runs it.
 * Fully keyboard operable; resets automatically once the action settles.
 */
export function ConfirmAction({
  label,
  confirmLabel,
  cancelLabel,
  onConfirm,
  variant = "danger",
  size = "sm",
  disabled = false,
  busy = false,
  title,
  className,
}: {
  label: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  busy?: boolean;
  title?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  // Reset once the action settles (busy → idle) or the control is disabled.
  useEffect(() => {
    if (!busy) setArmed(false);
  }, [busy]);
  useEffect(() => {
    if (disabled) setArmed(false);
  }, [disabled]);

  if (!armed) {
    return (
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={disabled || busy}
        loading={busy}
        title={title}
        className={className}
        onClick={() => setArmed(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-2 ${className ?? ""}`}
      role="group"
      aria-label={label}
    >
      <Button
        type="button"
        size={size}
        variant={variant}
        loading={busy}
        disabled={busy}
        autoFocus
        onClick={onConfirm}
      >
        {confirmLabel}
      </Button>
      <Button type="button" size={size} variant="ghost" disabled={busy} onClick={() => setArmed(false)}>
        {cancelLabel}
      </Button>
    </span>
  );
}
