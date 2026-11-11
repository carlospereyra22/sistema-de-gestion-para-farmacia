import { useState, type ReactElement, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  Landmark,
  MapPin,
  Pencil,
  Save,
  Search,
} from "lucide-react";
import {
  buscarCuitEnArca,
  type DatosDePadron,
  type FiscalProfile,
} from "./lib/api";
import { SinConexionError } from "./lib/api-fetch";
import { cuitValido, digitosCuit, formatearCuit } from "./lib/cuit";
import {
  avisosDeDatosFiscales,
  esResponsableInscripto,
  perfilDesdePadron,
  puedeContinuar,
  SOLO_FACTURA_C,
  type CampoFiscal,
} from "./lib/datos-fiscales";
import { ProductFilterSelect } from "./product-filter-select";

const control =
  "mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50";

const condiciones = [
  { value: "", label: "Sin definir" },
  { value: "MONOTAX", label: "Monotributista" },
  { value: "EXEMPT", label: "Exento" },
  { value: "REGISTERED", label: "Responsable inscripto" },
];

type Busqueda =
  | { estado: "nada" }
  | { estado: "buscando" }
  | { estado: "encontrado"; datos: DatosDePadron }
  | { estado: "error"; mensaje: string };

/** Un bloque corto de campos con título e ícono. */
function Bloque({
  titulo,
  icono,
  children,
}: {
  titulo: string;
  icono: ReactElement;
  children: ReactNode;
}) {
  return (
    <fieldset className="rounded-xl border border-slate-200 p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-slate-800">
        {icono}
        {titulo}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/**
 * Paso "Datos de la farmacia" (SISTEMA-96): escribir el CUIT, buscarlo en
 * ARCA y confirmar. Si el padrón no responde, se cargan a mano.
 */
export function DatosDeLaFarmacia(props: {
  token: string;
  organizationId: string;
  profile: FiscalProfile;
  busy: boolean;
  /** Muestra "Buscar en ARCA" (interruptor BUSQUEDA_ARCA). */
  buscarEnArca: boolean;
  onChange: (profile: FiscalProfile) => void;
  onGuardar: (continuar: boolean) => void;
  /** Sólo para tests: la fecha de hoy. */
  hoy?: Date;
  /** Sólo para tests: estado inicial de la búsqueda. */
  busquedaInicial?: Busqueda;
}): ReactElement {
  const {
    token,
    organizationId,
    profile,
    busy,
    buscarEnArca,
    onChange,
    onGuardar,
    hoy,
  } = props;
  const [busqueda, setBusqueda] = useState<Busqueda>(
    props.busquedaInicial ?? { estado: "nada" },
  );
  const avisos = avisosDeDatosFiscales(profile, hoy);
  const cambiar = (campo: CampoFiscal, valor: string) =>
    onChange({ ...profile, [campo]: valor });
  const buscar = async () => {
    if (!cuitValido(profile.cuit) || busqueda.estado === "buscando") return;
    setBusqueda({ estado: "buscando" });
    try {
      const datos = await buscarCuitEnArca(token, organizationId, profile.cuit);
      setBusqueda({ estado: "encontrado", datos });
    } catch (cause) {
      setBusqueda({
        estado: "error",
        mensaje:
          cause instanceof SinConexionError
            ? "Sin conexión no se puede buscar en ARCA. Cargá los datos a mano."
            : `${cause instanceof Error ? cause.message : "No se pudo buscar en ARCA."} Podés cargar los datos a mano.`,
      });
    }
  };
  const campo = (
    clave: CampoFiscal,
    etiqueta: string,
    ayuda: string,
    extra: { max: number; tipo?: string; placeholder?: string },
  ) => (
    <label className="text-xs font-medium text-slate-600">
      {etiqueta}
      <input
        aria-label={etiqueta}
        disabled={busy}
        className={control}
        maxLength={extra.max}
        type={extra.tipo ?? "text"}
        placeholder={extra.placeholder}
        value={profile[clave]}
        onChange={(event) => cambiar(clave, event.target.value)}
      />
      <span className="mt-1 block font-normal text-slate-500">{ayuda}</span>
      {avisos[clave] && (
        <span role="alert" className="mt-1 block font-normal text-amber-700">
          {avisos[clave]}
        </span>
      )}
    </label>
  );
  const responsableInscripto = esResponsableInscripto(profile.vatCondition);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const continuar =
          (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
            "value",
          ) === "continue";
        onGuardar(continuar);
      }}
      className="space-y-4"
    >
      <Bloque
        titulo="Identificación"
        icono={<Building2 size={16} className="text-teal-700" />}
      >
        <div className="text-xs font-medium text-slate-600 sm:col-span-2">
          <label htmlFor="cuit-emisor">CUIT de la farmacia</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <input
              id="cuit-emisor"
              aria-label="CUIT de la farmacia"
              disabled={busy}
              inputMode="numeric"
              maxLength={13}
              placeholder="20-12345678-9"
              className={`${control} mt-0 max-w-56`}
              value={formatearCuit(profile.cuit)}
              onChange={(event) => {
                cambiar("cuit", digitosCuit(event.target.value));
                setBusqueda({ estado: "nada" });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && buscarEnArca) {
                  event.preventDefault();
                  void buscar();
                }
              }}
            />
            {buscarEnArca && (
              <button
                type="button"
                disabled={
                  busy ||
                  !cuitValido(profile.cuit) ||
                  busqueda.estado === "buscando"
                }
                onClick={() => void buscar()}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-teal-600 bg-white px-4 text-sm font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50"
              >
                <Search size={16} aria-hidden="true" />
                {busqueda.estado === "buscando"
                  ? "Buscando…"
                  : "Buscar en ARCA"}
              </button>
            )}
          </div>
          <span className="mt-1 block font-normal text-slate-500">
            Los 11 números, con o sin guiones.
            {buscarEnArca &&
              " Con «Buscar en ARCA» completamos el resto por vos."}
          </span>
          {avisos.cuit && (
            <span
              role="alert"
              className="mt-1 block font-normal text-amber-700"
            >
              {avisos.cuit}
            </span>
          )}
        </div>
        {busqueda.estado === "encontrado" && (
          <div
            role="dialog"
            aria-label="¿Estos son tus datos?"
            className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 sm:col-span-2"
          >
            <p className="text-sm font-semibold text-teal-900">
              ¿Estos son tus datos?
            </p>
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm text-slate-700 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Razón social</dt>
                <dd className="font-medium">{busqueda.datos.nombre}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">
                  Condición frente al IVA
                </dt>
                <dd className="font-medium">{busqueda.datos.condicionIva}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Domicilio fiscal</dt>
                <dd className="font-medium">
                  {[
                    busqueda.datos.domicilio,
                    busqueda.datos.localidad,
                    busqueda.datos.provincia,
                    busqueda.datos.codigoPostal,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </dd>
              </div>
            </dl>
            {busqueda.datos.condicionIva === "Responsable inscripto" && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {SOLO_FACTURA_C}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onChange(perfilDesdePadron(profile, busqueda.datos));
                  setBusqueda({ estado: "nada" });
                }}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-medium text-white"
              >
                <Check size={16} aria-hidden="true" />
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setBusqueda({ estado: "nada" })}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700"
              >
                <Pencil size={16} aria-hidden="true" />
                Corregir a mano
              </button>
            </div>
          </div>
        )}
        {busqueda.estado === "error" && (
          <p
            role="status"
            className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2"
          >
            {busqueda.mensaje}
          </p>
        )}
        {campo(
          "legalName",
          "Razón social",
          "Como figura en tu constancia de inscripción de ARCA.",
          { max: 160 },
        )}
        <div className="text-xs font-medium text-slate-600">
          <p>Condición frente al IVA</p>
          <div className="mt-1.5">
            <ProductFilterSelect
              compact
              label="Condición frente al IVA"
              icon={null}
              disabled={busy}
              value={profile.vatCondition}
              options={condiciones}
              onChange={(value) => cambiar("vatCondition", value)}
            />
          </div>
          <span className="mt-1 block font-normal text-slate-500">
            Está en la constancia de inscripción.
          </span>
        </div>
      </Bloque>
      <Bloque
        titulo="Domicilio fiscal"
        icono={<MapPin size={16} className="text-teal-700" />}
      >
        <div className="sm:col-span-2">
          {campo(
            "address",
            "Domicilio fiscal",
            "El de la constancia de ARCA, aunque el local esté en otro lado.",
            { max: 200 },
          )}
        </div>
        {campo(
          "city",
          "Localidad",
          "Ciudad o localidad del domicilio fiscal.",
          {
            max: 100,
          },
        )}
        {campo("province", "Provincia", "Provincia del domicilio fiscal.", {
          max: 100,
        })}
        {campo("postalCode", "Código postal", "Por ejemplo 3300 o N3300ABC.", {
          max: 20,
        })}
      </Bloque>
      <Bloque
        titulo="Datos impositivos"
        icono={<Landmark size={16} className="text-teal-700" />}
      >
        {campo(
          "grossIncomeId",
          "Ingresos Brutos",
          "Número de inscripción en Ingresos Brutos. Lo tiene tu contador.",
          { max: 60 },
        )}
        {campo(
          "activityStart",
          "Inicio de actividades",
          "La fecha de inicio de actividades de la constancia.",
          { max: 10, tipo: "date" },
        )}
      </Bloque>
      {responsableInscripto && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {SOLO_FACTURA_C}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          value="continue"
          disabled={busy || !puedeContinuar(profile, hoy)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Guardando…" : "Guardar y continuar"}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 disabled:opacity-50"
        >
          <Save size={16} aria-hidden="true" />
          Guardar borrador
        </button>
        <span className="text-xs text-slate-500">
          Podés guardar aunque falten datos y completarlos después.
        </span>
      </div>
    </form>
  );
}
