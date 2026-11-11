import type { FiscalSetup } from "./api";
import { fiscalSteps, type FiscalStep } from "./fiscal-wizard";

/**
 * Estado de la facturación de punta a punta (SISTEMA-95). Sale SÓLO de lo que
 * responde el servidor (GET fiscal-setup): navegar los pasos no marca nada.
 */
export type EstadoDelPaso = "completo" | "pendiente" | "problema" | "bloqueado";

export type PasoDeFacturacion = {
  paso: FiscalStep;
  nombre: (typeof fiscalSteps)[number];
  estado: EstadoDelPaso;
  detalle: string;
};

export type EstadoDeFacturacion = {
  titulo: string;
  pasos: PasoDeFacturacion[];
  /** Próximo paso a hacer; undefined si ya factura en real. */
  siguiente?: FiscalStep;
  /** Pasos completos sobre 5, para la barra. */
  porcentaje: number;
};

const listo = (setup: FiscalSetup, code: string) =>
  setup.checks.find((check) => check.code === code)?.ready ?? false;
const detalle = (setup: FiscalSetup, code: string) =>
  setup.checks.find((check) => check.code === code)?.detail ?? "";

/** Sucursales activas sin punto de venta de prueba activo. */
export function sucursalesSinPunto(setup: FiscalSetup) {
  return setup.branches.filter(
    (branch) =>
      !setup.points.some(
        (point) => point.active && point.branchId === branch.id,
      ),
  );
}

export function estadoDeFacturacion(
  setup: FiscalSetup,
  /** Condición frente al IVA guardada: hoy sólo se factura C. */
  vatCondition?: string,
): EstadoDeFacturacion {
  const responsableInscripto = vatCondition === "REGISTERED";
  const datos: PasoDeFacturacion = {
    paso: 0,
    nombre: fiscalSteps[0],
    estado: responsableInscripto
      ? "problema"
      : listo(setup, "PROFILE")
        ? "completo"
        : "pendiente",
    detalle: responsableInscripto
      ? "Hoy el sistema sólo emite factura C (monotributo o exento)."
      : detalle(setup, "PROFILE"),
  };
  const conexion: PasoDeFacturacion = {
    paso: 1,
    nombre: fiscalSteps[1],
    estado: listo(setup, "AUTH") ? "completo" : "pendiente",
    detalle: detalle(setup, "AUTH"),
  };
  const sinPunto = sucursalesSinPunto(setup);
  const conPunto = setup.branches.length - sinPunto.length;
  const punto: PasoDeFacturacion = {
    paso: 2,
    nombre: fiscalSteps[2],
    estado:
      setup.branches.length > 0 && sinPunto.length === 0
        ? "completo"
        : "pendiente",
    detalle:
      setup.branches.length === 0
        ? "No hay sucursales activas."
        : sinPunto.length === 0
          ? "Todas las sucursales tienen punto de venta."
          : conPunto > 0
            ? `${conPunto} de ${setup.branches.length} sucursales con punto de venta. Falta: ${sinPunto.map(({ name }) => name).join(", ")}.`
            : "Falta asignarle un punto de venta a tus sucursales.",
  };
  const ultima = setup.trial?.status;
  const prueba: PasoDeFacturacion = {
    paso: 3,
    nombre: fiscalSteps[3],
    estado: listo(setup, "TRIAL")
      ? "completo"
      : ultima && ["PENDING", "UNCERTAIN", "REJECTED"].includes(ultima)
        ? "problema"
        : "pendiente",
    detalle: detalle(setup, "TRIAL"),
  };
  const previos = [datos, conexion, punto, prueba];
  const faltan = previos.filter(({ estado }) => estado !== "completo");
  const real: PasoDeFacturacion = {
    paso: 4,
    nombre: fiscalSteps[4],
    estado: listo(setup, "PRODUCTION")
      ? "completo"
      : faltan.length
        ? "bloqueado"
        : !setup.production.available
          ? "problema"
          : "pendiente",
    detalle: listo(setup, "PRODUCTION")
      ? detalle(setup, "PRODUCTION")
      : faltan.length
        ? `Se habilita cuando termines: ${faltan.map(({ nombre }) => nombre).join(", ")}.`
        : !setup.production.available
          ? "Lo habilita el administrador del sistema."
          : "Ya podés preparar la facturación real.",
  };
  const pasos = [...previos, real];
  const completos = pasos.filter(({ estado }) => estado === "completo").length;
  const titulo =
    real.estado === "completo"
      ? "Facturando en real"
      : faltan.length === 0
        ? "Lista para facturar en pruebas"
        : completos === 0
          ? "Todavía no configuraste la facturación"
          : faltan.length === 1
            ? "Te falta 1 paso para hacer tu primera factura de prueba"
            : `Te faltan ${faltan.length} pasos para hacer tu primera factura de prueba`;
  return {
    titulo,
    pasos,
    siguiente:
      real.estado === "completo" ? undefined : (faltan[0]?.paso ?? real.paso),
    porcentaje: Math.round((completos / pasos.length) * 100),
  };
}
