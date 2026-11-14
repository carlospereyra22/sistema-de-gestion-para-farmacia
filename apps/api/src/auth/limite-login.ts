import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

/** Intentos fallidos seguidos que se toleran por correo. */
export const INTENTOS_MAXIMOS = 8;
/** Ventana en la que se cuentan y tiempo que dura el bloqueo. */
export const VENTANA_MS = 5 * 60_000;
/** Tope de correos en memoria: evita que crezca sin límite ante un ataque. */
const CORREOS_MAXIMOS = 10_000;

type Registro = { fallos: number; desde: number };

/**
 * Límite de intentos de inicio de sesión (SISTEMA-106). Cuenta los fallos por
 * correo, no por IP: detrás del proxy de la web todas las farmacias llegan con
 * la misma. Vive en memoria de cada copia de la API (con dos copias el tope
 * real es el doble), sin tablas ni dependencias nuevas. No afecta las sesiones
 * ya abiertas: sólo frena los inicios nuevos de ese correo.
 */
@Injectable()
export class LimiteDeLogin {
  private readonly registros = new Map<string, Registro>();

  private clave(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Lanza 429 si el correo agotó sus intentos dentro de la ventana. */
  comprobar(email: string, ahora = Date.now()): void {
    const clave = this.clave(email);
    const registro = this.registros.get(clave);
    if (!registro) return;
    const restante = registro.desde + VENTANA_MS - ahora;
    if (restante <= 0) {
      this.registros.delete(clave);
      return;
    }
    if (registro.fallos >= INTENTOS_MAXIMOS)
      throw new HttpException(
        `Demasiados intentos fallidos. Esperá ${Math.ceil(restante / 60_000)} min y volvé a intentarlo.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }

  registrarFallo(email: string, ahora = Date.now()): void {
    const clave = this.clave(email);
    const registro = this.registros.get(clave);
    if (registro && registro.desde + VENTANA_MS > ahora) {
      registro.fallos += 1;
      return;
    }
    if (this.registros.size >= CORREOS_MAXIMOS) this.limpiar(ahora);
    this.registros.set(clave, { fallos: 1, desde: ahora });
  }

  registrarExito(email: string): void {
    this.registros.delete(this.clave(email));
  }

  /** Quita los vencidos y, si aun así no hay lugar, los más viejos. */
  private limpiar(ahora: number): void {
    for (const [clave, registro] of this.registros)
      if (registro.desde + VENTANA_MS <= ahora) this.registros.delete(clave);
    for (const clave of this.registros.keys()) {
      if (this.registros.size < CORREOS_MAXIMOS) break;
      this.registros.delete(clave);
    }
  }
}
