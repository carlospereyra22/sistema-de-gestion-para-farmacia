// Cerrar sesión sin conexión: la PC olvida la sesión enseguida y el servidor
// se entera (revoca la sesión) en el próximo arranque con conexión.

const CLAVE = "gestion:cierre-de-sesion-pendiente";

export function recordarCierreDeSesion() {
  try {
    localStorage.setItem(CLAVE, "1");
  } catch {
    /* sin almacenamiento: el cierre sólo es local */
  }
}

export function olvidarCierreDeSesion() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* nada que olvidar */
  }
}

export function cierreDeSesionPendiente() {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}
