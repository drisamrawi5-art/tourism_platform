import { t, type Dictionary } from "@/i18n";

/**
 * Read-only star row for listing a review's rating. Stars are decoration —
 * the accessible name is the localized "N out of 5" label.
 */
export function ReadOnlyRating({ dict, value }: { dict: Dictionary; value: number }) {
  const stars = Math.min(5, Math.max(0, Math.round(value)));
  return (
    <span
      role="img"
      aria-label={t(dict, "reviews.stars", { n: stars })}
      className="inline-flex items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`size-4 ${n <= stars ? "text-peach-500" : "text-rocky-300"}`}
          fill={n <= stars ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3.6l2.6 5.3 5.9.9-4.3 4.2 1 5.8L12 17.1l-5.2 2.7 1-5.8L3.5 9.8l5.9-.9L12 3.6z"
          />
        </svg>
      ))}
    </span>
  );
}
