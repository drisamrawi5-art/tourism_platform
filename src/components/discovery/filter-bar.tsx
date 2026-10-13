import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';

/**
 * Server-side filter bar: a plain GET form (no client JS). Submitting
 * navigates to `action?name=value`, and the page reads it from searchParams.
 */
export function FilterBar({
  action,
  name,
  label,
  options,
  value,
  submitLabel,
  clearHref,
  clearLabel,
  id = 'filter',
}: {
  action: string;
  name: string;
  label: string;
  options: { value: string; label: string }[];
  value: string | null;
  submitLabel: string;
  clearHref: string;
  clearLabel: string;
  id?: string;
}) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-64">
        <Field label={label} htmlFor={id}>
          <Select id={id} name={name} defaultValue={value ?? ''}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit">{submitLabel}</Button>
      {value ? (
        <ButtonLink href={clearHref} variant="ghost">
          {clearLabel}
        </ButtonLink>
      ) : null}
    </form>
  );
}
