import { notFound } from "next/navigation";

/**
 * Catch-all under /{locale}: any unknown path renders the localised 404
 * (app/[locale]/not-found.tsx) instead of Next's default error page.
 */
export default function CatchAll() {
  notFound();
}
