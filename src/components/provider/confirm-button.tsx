"use client";

import { useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

/**
 * Two-phase inline confirmation (no window.confirm): the first click arms the
 * button and swaps its label to the confirm prompt; a keyboard-reachable
 * cancel disarms it. The action only runs on the second click.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  cancelLabel,
  onConfirm,
  busy = false,
  disabled = false,
  variant = "primary",
  size = "md",
}: {
  label: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || busy}
        onClick={() => setArmed(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={variant}
        size={size}
        loading={busy}
        disabled={disabled}
        onClick={() => {
          setArmed(false);
          void onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        disabled={busy}
        onClick={() => setArmed(false)}
      >
        {cancelLabel}
      </Button>
    </span>
  );
}
