"use client";

import { useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

/**
 * Two-step confirm for destructive admin actions (reject, unpublish, delete,
 * suspend): the first click arms the button, the second one runs the action —
 * a Cancel affordance aborts. Matches the codebase rule that destructive
 * operations are never single-click.
 */
export function ArmButton({
  label,
  onConfirm,
  cancelLabel,
  variant = "danger",
  size = "sm",
  disabled = false,
  className,
}: {
  label: string;
  onConfirm: () => void | Promise<void>;
  cancelLabel: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setArmed(false);
    }
  }

  if (!armed) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || busy}
        className={className}
        onClick={() => setArmed(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant={variant}
        size={size}
        loading={busy}
        className={className}
        onClick={() => void run()}
      >
        {label}
      </Button>
      <Button type="button" variant="ghost" size={size} onClick={() => setArmed(false)}>
        {cancelLabel}
      </Button>
    </span>
  );
}
