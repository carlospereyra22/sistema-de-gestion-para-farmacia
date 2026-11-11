import { ErrorDeArca } from "./api";
import { SinConexionError } from "./api-fetch";

/**
 * Resultado de "Probar conexión con ARCA" en palabras simples, con qué hacer
 * (SISTEMA-97). El detalle técnico no se pierde: va en un desplegable.
 */
export type TipoDeResultado =
  | "conectado"
  | "sin-certificado"
  | "vencido"
  | "no-autorizado"
  | "cuit"
  | "no-aceptado"
  | "otra-instalacion"
  | "sin-conexion"
  | "otro";

export type ResultadoDeConexion = {
  tipo: TipoDeResultado;
  titulo: string;
  queHacer: string;
  /** Mensaje del servidor y código de ARCA, para el contador o soporte. */
  detalle?: string;
};

export const CONECTADO: ResultadoDeConexion = {
  tipo: "conectado",
  titulo: "Conectado",
  queHacer:
    "ARCA reconoce tu certificado. Ya podés seguir con el punto de venta.",
};

// El orden importa: el primero que coincide gana. Los mensajes del servidor
// mencionan "CUIT representado" como ayuda, así que el CUIT va después.
const reglas: {
  tipo: TipoDeResultado;
  patron: RegExp;
  titulo: string;
  queHacer: string;
}[] = [
  {
    tipo: "otra-instalacion",
    patron: /alreadyauthenticated|ya emitió un acceso/i,
    titulo: "ARCA ya dio un acceso a este certificado",
    queHacer:
      "Otra instalación lo está usando. Esperá unos minutos (hasta 12 horas) o usá la instalación que lo pidió.",
  },
  {
    tipo: "no-autorizado",
    patron: /notauthorized|not\.authorized|no autorizad|autoriz[áa] el alias/i,
    titulo: "Falta autorizar la factura electrónica",
    queHacer:
      "En ARCA, entrá a «Crear autorización a servicio», elegí tu certificado, el CUIT de la farmacia y el servicio de factura electrónica (wsfe). Después volvé a probar.",
  },
  {
    tipo: "cuit",
    patron: /cambió el cuit|no coincide/i,
    titulo: "El CUIT no coincide",
    queHacer:
      "El certificado es de otro CUIT que el de la farmacia. Revisá el CUIT en Datos de la farmacia o, en ARCA, autorizá el certificado para el CUIT de la farmacia.",
  },
  {
    tipo: "no-aceptado",
    patron: /untrusted|no fue aceptado/i,
    titulo: "ARCA no acepta este certificado",
    queHacer:
      "Revisá que sea el certificado de prueba (el de «Certificados de prueba» de ARCA) y no el de facturación real.",
  },
  {
    tipo: "sin-certificado",
    patron: /primero compro|carg[áa] un certificado|sin certificado/i,
    titulo: "Falta un certificado vigente",
    queHacer:
      "Subí el certificado que te dio ARCA. Si el que tenías venció, pedí uno nuevo con la guía de «Es la primera vez».",
  },
  {
    tipo: "vencido",
    patron: /vencid|expir/i,
    titulo: "El certificado venció",
    queHacer:
      "Pedí un certificado nuevo en ARCA con la guía de «Es la primera vez» y subilo de nuevo.",
  },
];

const SIN_CONEXION: Omit<ResultadoDeConexion, "detalle"> = {
  tipo: "sin-conexion",
  titulo: "Sin conexión con ARCA",
  queHacer:
    "No pudimos comunicarnos con ARCA. Revisá internet y probá de nuevo en unos minutos: a veces ARCA está caído.",
};

/** Traduce el error de probar la conexión. */
export function traducirErrorDeArca(error: unknown): ResultadoDeConexion {
  if (error instanceof SinConexionError)
    return { ...SIN_CONEXION, detalle: error.message };
  const mensaje = error instanceof Error ? error.message : String(error);
  const falla = error instanceof ErrorDeArca ? error.falla : undefined;
  const detalle = [mensaje, falla && `Código de ARCA: ${falla}`]
    .filter(Boolean)
    .join(" · ");
  if (error instanceof ErrorDeArca && error.tipo === "ARCA_SIN_RESPUESTA")
    return { ...SIN_CONEXION, detalle };
  const texto = `${mensaje} ${falla ?? ""}`;
  const regla = reglas.find(({ patron }) => patron.test(texto));
  if (regla)
    return {
      tipo: regla.tipo,
      titulo: regla.titulo,
      queHacer: regla.queHacer,
      detalle,
    };
  return {
    tipo: "otro",
    titulo: "No se pudo conectar con ARCA",
    queHacer:
      "Revisá el certificado y su autorización. Si sigue igual, pasale el detalle técnico a soporte.",
    detalle,
  };
}
