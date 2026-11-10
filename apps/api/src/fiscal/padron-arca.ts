import { BadRequestException } from "@nestjs/common";
import { list, obj, str } from "./arca-soap";

// Padrón de ARCA (constancia de inscripción, SISTEMA-70): con el CUIT de un
// cliente se traen su nombre, su condición frente al IVA y su domicilio
// fiscal, para no tipearlos.

export type DatosDePadron = {
  cuit: string;
  nombre: string;
  condicionIva:
    "Responsable inscripto" | "Monotributista" | "Exento" | "Consumidor final";
  domicilio: string;
  localidad: string;
  provincia: string;
  codigoPostal: string;
  /** "ACTIVO" u otro estado de la clave en ARCA. */
  estado: string;
};

/** CUIT/CUIL de 11 dígitos con su dígito verificador, sin guiones. */
export function cuitValido(valor: string): string {
  const cuit = valor.replace(/[\s.-]/g, "");
  if (!/^\d{11}$/.test(cuit))
    throw new BadRequestException(
      "Ingresá un CUIT o CUIL de 11 dígitos. Con un DNI no se puede buscar en ARCA.",
    );
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(cuit[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  if (verificador !== Number(cuit[10]))
    throw new BadRequestException("El CUIT no es válido: revisá los números.");
  return cuit;
}

const IVA = "30";
const IVA_EXENTO = "32";

/** Lee la respuesta de getPersona_v2 (personaReturn). */
export function datosDePadron(
  cuit: string,
  persona: Record<string, unknown>,
): DatosDePadron | null {
  const generales = obj(persona.datosGenerales);
  if (!Object.keys(generales).length) return null;
  const razonSocial = str(generales.razonSocial).trim();
  const nombre =
    razonSocial ||
    [str(generales.apellido).trim(), str(generales.nombre).trim()]
      .filter(Boolean)
      .join(" ");
  const impuestos = list(obj(persona.datosRegimenGeneral).impuesto).map((i) =>
    str(obj(i).idImpuesto),
  );
  const monotributo = Object.keys(obj(persona.datosMonotributo)).length > 0;
  const condicionIva = monotributo
    ? "Monotributista"
    : impuestos.includes(IVA)
      ? "Responsable inscripto"
      : impuestos.includes(IVA_EXENTO)
        ? "Exento"
        : "Consumidor final";
  const domicilio = obj(generales.domicilioFiscal);
  return {
    cuit,
    nombre,
    condicionIva,
    domicilio: str(domicilio.direccion).trim(),
    localidad: str(domicilio.localidad).trim(),
    provincia: str(domicilio.descripcionProvincia).trim(),
    codigoPostal: str(domicilio.codPostal).trim(),
    estado: str(generales.estadoClave).trim(),
  };
}
