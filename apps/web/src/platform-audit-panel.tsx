import { useEffect, useState } from "react";
import {
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
} from "./data-table";
import {
  getPlatformAudit,
  PlatformApiError,
  type PlatformAuditEntry,
} from "./lib/platform-api";
import {
  platformActionLabel,
  platformActorLabel,
  platformDateLabel,
} from "./lib/platform-audit";
import { Pagination } from "./pagination";

const PAGE_SIZE = 10;

export function PlatformAuditTable({ rows }: { rows: PlatformAuditEntry[] }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  return (
    <DataTable
      label="Auditoría de la plataforma"
      columns={[{ label: "Fecha" }, { label: "Acción" }, { label: "Quién" }]}
      minWidthClass="min-w-180"
      footer={
        rows.length > PAGE_SIZE ? (
          <Pagination
            integrated
            total={rows.length}
            currentPage={current}
            totalPages={totalPages}
            noun="registros"
            label="Páginas de la auditoría"
            onChange={setPage}
          />
        ) : undefined
      }
    >
      {visible.length === 0 ? (
        <DataTableEmpty colSpan={3}>Todavía no hay registros.</DataTableEmpty>
      ) : (
        visible.map((row) => (
          <DataTableRow key={row.id}>
            <DataTableCell className="whitespace-nowrap">
              {platformDateLabel(row.createdAt)}
            </DataTableCell>
            <DataTableCell>{platformActionLabel(row.action)}</DataTableCell>
            <DataTableCell>{platformActorLabel(row.actorEmail)}</DataTableCell>
          </DataTableRow>
        ))
      )}
    </DataTable>
  );
}

export function PlatformAuditPanel({
  token,
  onVerificationExpired,
}: {
  token: string;
  onVerificationExpired: () => void;
}) {
  const [rows, setRows] = useState<PlatformAuditEntry[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getPlatformAudit(token)
      .then((items) => {
        if (active) setRows(items);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (
          cause instanceof PlatformApiError &&
          cause.code === "PLATFORM_VERIFICATION_REQUIRED"
        )
          onVerificationExpired();
        else
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar la auditoría.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, onVerificationExpired]);
  return (
    <>
      <h1 className="text-2xl font-semibold">Auditoría</h1>
      <p className="mt-1 text-sm text-slate-500">
        Últimas 100 acciones hechas en la plataforma.
      </p>
      <div className="mt-4">
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : rows ? (
          <PlatformAuditTable rows={rows} />
        ) : (
          <p role="status" className="text-sm text-slate-500">
            Cargando…
          </p>
        )}
      </div>
    </>
  );
}
