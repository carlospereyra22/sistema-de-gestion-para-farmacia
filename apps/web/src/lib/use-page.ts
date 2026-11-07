import { useState } from "react";

/** Página visible de una lista que ya está toda en memoria. */
export function usePage<T>(rows: readonly T[], size: number) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, totalPages);
  return {
    current,
    totalPages,
    setPage,
    visible: rows.slice((current - 1) * size, current * size),
  };
}
