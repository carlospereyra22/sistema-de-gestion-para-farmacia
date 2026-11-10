import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  direccionDelWorkerPdf,
  guardarWorkerPdf,
  olvidarWorkerPdf,
} from "./worker-pdf";

describe("worker del lector de PDF en memoria (SISTEMA-76)", () => {
  beforeEach(() => olvidarWorkerPdf());

  it("lo carga una sola vez y después se usa sin red", async () => {
    const leer = vi.fn(async () => "codigo del worker");
    const crearUrl = vi.fn(() => "blob:http://localhost/worker");
    await expect(guardarWorkerPdf(leer, crearUrl)).resolves.toBe(
      "blob:http://localhost/worker",
    );
    const sinRed = vi.fn(async (): Promise<string> => {
      throw new TypeError("Failed to fetch dynamically imported module");
    });
    await expect(direccionDelWorkerPdf(sinRed, crearUrl)).resolves.toBe(
      "blob:http://localhost/worker",
    );
    expect(leer).toHaveBeenCalledTimes(1);
    expect(sinRed).not.toHaveBeenCalled();
    const blob = (crearUrl.mock.calls[0] as unknown as [Blob])[0];
    expect(await blob.text()).toBe("codigo del worker");
  });

  it("sin copia y sin red usa la dirección del archivo y reintenta después", async () => {
    const sinRed = vi.fn(async (): Promise<string> => {
      throw new TypeError("Failed to fetch dynamically imported module");
    });
    const direccion = await direccionDelWorkerPdf(sinRed);
    expect(direccion).not.toMatch(/^blob:/);
    expect(direccion).toContain("pdf.worker");
    await expect(
      guardarWorkerPdf(
        async () => "codigo",
        () => "blob:x",
      ),
    ).resolves.toBe("blob:x");
  });

  it("toma el código del archivo tal cual, sin pedirlo por dirección", async () => {
    const urls: Blob[] = [];
    await guardarWorkerPdf(undefined, (blob) => {
      urls.push(blob);
      return "blob:z";
    });
    const codigo = await urls[0]!.text();
    expect(codigo).toContain("WorkerMessageHandler");
    expect(codigo).not.toContain("@vite/client");
  });
});
