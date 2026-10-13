"use client";

import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FieldGroup, Input, Select } from "@/components/ui/field";

/**
 * Compact filter scaffolding shared by the admin list views.
 * Selects apply immediately (caller pushes the URL); free-text filters are
 * submitted with the form so Enter works.
 */
export function FilterBar({
  children,
  onSubmit,
  onClear,
  submitLabel,
  clearLabel,
  ariaLabel,
}: {
  children: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  onClear?: () => void;
  submitLabel?: string;
  clearLabel?: string;
  ariaLabel: string;
}) {
  return (
    <form
      aria-label={ariaLabel}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(event);
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-1 flex-wrap items-end gap-3">{children}</div>
      <div className="flex gap-2">
        {onSubmit && submitLabel ? (
          <Button type="submit" size="sm" variant="secondary">
            {submitLabel}
          </Button>
        ) : null}
        {onClear && clearLabel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            {clearLabel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
  minWidth = "min-w-40",
}: {
  id: string;
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  minWidth?: string;
}) {
  return (
    <div className={minWidth}>
      <FieldGroup label={label}>
        <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FieldGroup>
    </div>
  );
}

export function FilterInput({
  id,
  label,
  value,
  type = "text",
  placeholder,
  onChange,
  minWidth = "min-w-44",
}: {
  id: string;
  label: string;
  value: string;
  type?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  minWidth?: string;
}) {
  return (
    <div className={minWidth}>
      <FieldGroup label={label}>
        <Input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </FieldGroup>
    </div>
  );
}
