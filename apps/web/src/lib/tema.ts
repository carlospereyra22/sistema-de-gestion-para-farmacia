// Tema claro / oscuro de la pantalla (SISTEMA-105). Lo elige cada navegador y
// queda guardado en esa PC (no en el usuario): sobrevive a cerrar sesión y se
// aplica desde la pantalla de ingreso. index.html lo aplica antes de pintar,
// con la misma clave, para que no haya un destello claro al abrir.

export type Tema = "claro" | "oscuro";

export const CLAVE_TEMA = "gestion:tema";

/** Color de la barra del navegador/PWA en cada tema (fondo de la app). */
export const COLOR_BARRA: Record<Tema, string> = {
  claro: "#f4f8fa",
  oscuro: "#0b1115",
};

type Lector = Pick<Storage, "getItem">;
type Escritor = Pick<Storage, "setItem">;

export function leerTema(almacen: Lector | undefined): Tema {
  try {
    return almacen?.getItem(CLAVE_TEMA) === "oscuro" ? "oscuro" : "claro";
  } catch {
    return "claro";
  }
}

export function guardarTema(almacen: Escritor | undefined, tema: Tema) {
  try {
    almacen?.setItem(CLAVE_TEMA, tema);
  } catch {
    // Navegador sin almacenamiento (modo privado estricto): rige sólo ahora.
  }
}

interface DocumentoTema {
  documentElement: Pick<HTMLElement, "classList">;
  querySelector(selector: string): Element | null;
}

/**
 * Pone o saca la clase `dark` de <html>. Los botones tienen transiciones de
 * color: se apagan un instante para que toda la pantalla cambie junta.
 */
export function aplicarTema(
  doc: DocumentoTema,
  tema: Tema,
  esperarCuadro: (listo: () => void) => void = (listo) =>
    requestAnimationFrame(() => requestAnimationFrame(listo)),
) {
  const raiz = doc.documentElement.classList;
  if (raiz.contains("dark") === (tema === "oscuro")) return;
  raiz.add("cambiando-tema");
  raiz.toggle("dark", tema === "oscuro");
  const barra = doc.querySelector('meta[name="theme-color"]');
  if (barra) barra.setAttribute("content", COLOR_BARRA[tema]);
  esperarCuadro(() => raiz.remove("cambiando-tema"));
}

// --- Estado compartido para React (useSyncExternalStore) ---

const avisos = new Set<() => void>();
let actual: Tema | undefined;

function almacenDelNavegador() {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function temaActual(): Tema {
  actual ??= leerTema(almacenDelNavegador());
  return actual;
}

export function cambiarTema(tema: Tema) {
  guardarTema(almacenDelNavegador(), tema);
  usarTema(tema);
}

function usarTema(tema: Tema) {
  actual = tema;
  if (typeof document !== "undefined") aplicarTema(document, tema);
  for (const aviso of avisos) aviso();
}

function otraPestana(evento: StorageEvent) {
  if (evento.key === CLAVE_TEMA || evento.key === null)
    usarTema(leerTema(almacenDelNavegador()));
}

/** Avisa los cambios de tema, también los hechos en otra pestaña. */
export function suscribirTema(aviso: () => void) {
  const ventana = typeof window === "undefined" ? undefined : window;
  if (avisos.size === 0) ventana?.addEventListener("storage", otraPestana);
  avisos.add(aviso);
  return () => {
    avisos.delete(aviso);
    if (avisos.size === 0) ventana?.removeEventListener("storage", otraPestana);
  };
}
