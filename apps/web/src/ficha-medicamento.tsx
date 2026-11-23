import { BookOpen, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CalculadoraInfantil } from "./calculadora-infantil";
import {
  esLiquidoOral,
  esPresentacionPediatrica,
  getFichaTerapeutica,
  linkBusquedaProspecto,
  mgPorMl,
  resumenFicha,
  tomaEnMl,
  type ResumenFicha,
} from "./lib/ficha-terapeutica";

const formatoMgMl = (valor: number) =>
  `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(valor)} mg/ml`;

type Estado =
  | { tipo: "inicial" }
  | { tipo: "cargando" }
  | { tipo: "lista"; resumen: ResumenFicha | null }
  | { tipo: "error"; mensaje: string };

function Dato({
  titulo,
  children,
  ancho,
}: {
  titulo: string;
  children: React.ReactNode;
  ancho?: boolean;
}) {
  return (
    <div className={ancho ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-semibold text-slate-600">{titulo}</dt>
      <dd className="text-slate-700">{children}</dd>
    </div>
  );
}

// Los datos de la ficha; también se usan en Ventas (prospecto-venta.tsx).
export function DatosFicha({
  resumen,
  nombre,
  presentacion,
  concentracion,
}: {
  resumen: ResumenFicha;
  nombre: string;
  presentacion?: string | null;
  /** La cargada en el producto ("50 mg/ml"). */
  concentracion?: string | null;
}) {
  // Jarabes, gotas y suspensiones: la toma en ml de esta presentación, con la
  // concentración del producto, de la base o del nombre.
  const mgMl = esLiquidoOral(presentacion)
    ? ([concentracion, resumen.dosisPresentacion, nombre]
        .map((texto) => mgPorMl(texto))
        .find((valor) => valor !== null) ?? null)
    : null;
  const enMl = mgMl && resumen.dosis ? tomaEnMl(resumen.dosis, mgMl) : null;
  return (
    <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
      <Dato titulo="Para qué sirve" ancho>
        <span className="font-medium text-slate-800">
          {resumen.paraQueSirve}
        </span>
        {resumen.accionTerapeutica && (
          <span className="block text-xs text-slate-500">
            Acción terapéutica: {resumen.accionTerapeutica}
          </span>
        )}
      </Dato>
      {(resumen.dosis || resumen.dosisDeOtraForma || resumen.pediatrica) && (
        <Dato
          titulo={
            resumen.deProspecto
              ? "Cómo se usa (prospecto)"
              : `Cada cuánto se suele ${/^oral/.test(resumen.via) || !resumen.via ? "tomar" : "usar"} (adultos)`
          }
          ancho
        >
          {resumen.dosis ? (
            <span className="font-medium text-slate-800">{resumen.dosis}</span>
          ) : (
            // La dosis guardada es de otra forma (la de los comprimidos no
            // sirve para la ampolla o el gel): no se muestra.
            <span className="text-slate-600">
              La dosis de esta presentación está en el prospecto.
            </span>
          )}
          {enMl && mgMl && (
            <span className="mt-1 block text-sm font-semibold text-teal-800">
              En esta presentación ({formatoMgMl(mgMl)}): {enMl} por toma.
            </span>
          )}
          {resumen.pediatrica ? (
            <CalculadoraInfantil dosis={resumen.pediatrica} mgPorMl={mgMl} />
          ) : (
            !resumen.deProspecto &&
            esPresentacionPediatrica(nombre, presentacion) && (
              <span className="mt-1 block text-xs font-medium text-amber-700">
                Presentación líquida o pediátrica: en niños la dosis va según el
                peso. Verificala en el prospecto.
              </span>
            )
          )}
        </Dato>
      )}
      {resumen.via && (
        <Dato titulo="Vía">
          <span className="first-letter:uppercase">{resumen.via}</span>
        </Dato>
      )}
      {mgMl && <Dato titulo="Concentración">{formatoMgMl(mgMl)}</Dato>}
      {resumen.condicionVenta && (
        <Dato titulo="Condición de venta">{resumen.condicionVenta}</Dato>
      )}
      {resumen.principioActivo && (
        <Dato titulo="Principio activo">
          <span className="first-letter:uppercase">
            {resumen.principioActivo}
          </span>
        </Dato>
      )}
      {resumen.composicion && (
        <Dato titulo="Composición" ancho>
          {resumen.composicion}
        </Dato>
      )}
      {resumen.fuente && (
        <p className="text-xs text-slate-500 sm:col-span-2">
          Fuente:{" "}
          <a
            href={resumen.fuente.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-teal-700 underline-offset-2 hover:underline"
          >
            {resumen.fuente.nombre}
          </a>
        </p>
      )}
    </dl>
  );
}

// Ficha del medicamento (SISTEMA-108): para qué sirve y cada cuánto se suele
// tomar, una nota propia de la farmacia y la búsqueda del prospecto.
export function FichaMedicamento({
  token,
  organizationId,
  productoId,
  nombre,
  laboratorio,
  principioActivo,
  presentacion,
  concentracion,
  forma,
  codigos,
  nota,
  onNota,
  estadoInicial = { tipo: "inicial" },
}: {
  token: string;
  organizationId: string;
  // Con un producto ya guardado se consulta sola al abrir.
  productoId?: string;
  nombre: string;
  laboratorio?: string;
  principioActivo?: string;
  presentacion?: string;
  concentracion?: string;
  forma?: string;
  codigos: string[];
  nota: string;
  onNota: (value: string) => void;
  estadoInicial?: Estado;
}) {
  const [estado, setEstado] = useState<Estado>(estadoInicial);
  const pedido = useRef<AbortController | null>(null);
  const datos = useRef({
    nombre,
    codigos,
    principioActivo,
    forma,
    presentacion,
  });
  datos.current = { nombre, codigos, principioActivo, forma, presentacion };

  const consultar = () => {
    const actuales = datos.current;
    if (actuales.nombre.trim().length < 2) {
      setEstado({ tipo: "error", mensaje: "Cargá el nombre del producto." });
      return;
    }
    pedido.current?.abort();
    const controller = new AbortController();
    pedido.current = controller;
    setEstado({ tipo: "cargando" });
    getFichaTerapeutica(
      token,
      organizationId,
      actuales,
      controller.signal,
    ).then(
      (respuesta) => {
        if (!controller.signal.aborted)
          setEstado({ tipo: "lista", resumen: resumenFicha(respuesta) });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setEstado({
          tipo: "error",
          mensaje:
            error instanceof Error
              ? error.message
              : "No se pudo consultar la ficha.",
        });
      },
    );
  };

  useEffect(() => {
    if (productoId) consultar();
    return () => pedido.current?.abort();
    // Solo al abrir otro producto; después se reconsulta con el botón.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId]);

  const resumen = estado.tipo === "lista" ? estado.resumen : null;

  return (
    <section
      aria-label="Ficha del medicamento"
      className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2.5 text-sm font-semibold text-slate-700">
          <BookOpen size={17} className="text-teal-700" aria-hidden />
          Ficha del medicamento
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={consultar}
            disabled={estado.tipo === "cargando"}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
          >
            <RefreshCw
              size={13}
              aria-hidden
              className={estado.tipo === "cargando" ? "animate-spin" : ""}
            />
            {estado.tipo === "inicial" ? "Consultar" : "Actualizar"}
          </button>
          {nombre.trim().length >= 2 && (
            <a
              href={linkBusquedaProspecto(nombre, laboratorio)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-teal-700 hover:bg-teal-50"
            >
              <ExternalLink size={13} aria-hidden />
              Buscar prospecto
            </a>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
        {estado.tipo === "inicial" && (
          <p className="text-slate-500">
            Consultá para ver para qué sirve y cada cuánto se suele tomar.
          </p>
        )}
        {estado.tipo === "cargando" && (
          <p className="text-slate-500">Buscando la ficha…</p>
        )}
        {estado.tipo === "error" && (
          <p className="text-red-700">{estado.mensaje}</p>
        )}
        {estado.tipo === "lista" && !resumen && (
          <p className="text-slate-500">
            No se encontró la ficha. Completá el principio activo o el código de
            barras, o buscá el prospecto.
          </p>
        )}
        {resumen && (
          <DatosFicha
            resumen={resumen}
            nombre={nombre}
            presentacion={presentacion}
            concentracion={concentracion}
          />
        )}
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-slate-600">
          Indicaciones de la farmacia
        </span>
        <textarea
          aria-label="Indicaciones de la farmacia"
          value={nota}
          onChange={(event) => onNota(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Ej. 1 comprimido cada 8 horas, con comida. No más de 5 días sin consultar al médico."
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
        />
      </label>
    </section>
  );
}
