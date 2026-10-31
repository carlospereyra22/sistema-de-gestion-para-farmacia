import type { ThermalTicket } from "@gestion/contracts";
const endpoint = "http://127.0.0.1:17890";
export class ThermalAgentUnavailable extends Error {}
export async function prepareThermalTicket(
  ticket: ThermalTicket,
): Promise<ThermalTicket> {
  let response: Response;
  try {
    response = await fetch(`${endpoint}/status`, {
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new ThermalAgentUnavailable(
      "No pudimos conectar con el agente. Puede no estar instalado, estar detenido o faltar el permiso de acceso local del navegador.",
    );
  }
  const health = (await response.json()) as {
    protocol?: string;
    installed?: boolean;
    printer?: string;
    error?: string;
  };
  if (!response.ok && health.error)
    throw new ThermalAgentUnavailable(
      `${health.error} Abrí el instalador para verificar o recuperar la configuración.`,
    );
  if (!response.ok || health.protocol !== "gestion-v21-minor-v1")
    throw new Error(
      "Hay otro agente en el puerto 17890. Cerrá el borrador V21 y abrí el agente integrado de Gestión.",
    );
  if (health.installed === false)
    throw new ThermalAgentUnavailable(
      `El agente responde, pero Windows no encuentra la impresora configurada (${health.printer ?? "sin nombre"}). Instalá el driver oficial y abrí Instalar.vbs para seleccionar la impresora y recuperar la configuración.`,
    );
  return ticket;
}
export async function sendThermalTicket(
  ticket: ThermalTicket,
  requestId: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${endpoint}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, sale: ticket }),
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new Error(
      "No se recibió confirmación del agente. Revisá el papel y la cola de impresión; reintentar conserva el mismo envío para evitar duplicados.",
    );
  }
  const result = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok || !result.ok)
    throw new Error(result.error || "No se pudo enviar el ticket.");
}
