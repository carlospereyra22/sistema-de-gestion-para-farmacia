import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
export function ThermalPrinterStatus() {
  const [status, setStatus] = useState("Verificando impresora…");
  useEffect(() => {
    let active = true;
    let pending = false;
    const check = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("http://127.0.0.1:17890/status", {
          signal: AbortSignal.timeout(8000),
        });
        const result = (await response.json()) as {
          ok?: boolean;
          installed?: boolean;
          printer?: string;
        };
        if (active)
          setStatus(
            response.ok && result.ok
              ? result.installed
                ? `Impresora lista: ${result.printer}`
                : "Impresora no encontrada en Windows"
              : "Impresora: revisar conexión",
          );
      } catch {
        if (active) setStatus("Impresión desconectada · recuperando conexión");
      } finally {
        pending = false;
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  return (
    <span
      title={`${status}. El estado confirma el componente y la instalación, no la salida de papel. Si persiste, revisá el componente de impresión y los permisos de red local del navegador.`}
      className="inline-flex items-center gap-1.5 text-xs text-slate-500"
    >
      <Printer size={15} />
      {status}
    </span>
  );
}
