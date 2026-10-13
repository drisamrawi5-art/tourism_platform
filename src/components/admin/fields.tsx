"use client";

/** Native checkbox with a real <label> (admin settings/forms). */
export function Checkbox({
  id,
  label,
  checked,
  onChange,
  disabled = false,
  hint,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className={`flex items-start gap-2 text-sm text-rocky-800 ${
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        }`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-rocky-300 text-forest-600 focus:outline-none focus:ring-2 focus:ring-water-600/40"
        />
        <span>{label}</span>
      </label>
      {hint ? <p className="ps-6 text-xs text-rocky-500">{hint}</p> : null}
    </div>
  );
}
