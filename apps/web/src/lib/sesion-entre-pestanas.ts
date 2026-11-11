/**
 * Sesión de otro usuario en otra pestaña (SISTEMA-92).
 *
 * La sesión vive en una sola cookie por navegador. Si otra persona inicia
 * sesión en otra pestaña, la cookie pasa a ser suya: esta pestaña nunca cambia
 * de usuario sola. Se pausa, deja de mandar pedidos y ofrece seguir como el
 * otro usuario (recargando) o volver a entrar con el suyo.
 */

const CANAL = "gestion-sesion";
const CLAVE_RESPALDO = "gestion:sesion-aviso";

export type AvisoDeSesion = {
  tipo: "inicio" | "cierre";
  /** Pestaña que avisa: no reacciona a su propio aviso. */
  origen: string;
};

/** Identifica a esta pestaña en los avisos. */
export const ESTA_PESTANA =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Math.random());

let canal: BroadcastChannel | undefined;
const oyentes = new Set<(aviso: AvisoDeSesion) => void>();

function esAviso(valor: unknown): valor is AvisoDeSesion {
  const aviso = valor as Partial<AvisoDeSesion> | null;
  return (
    !!aviso &&
    (aviso.tipo === "inicio" || aviso.tipo === "cierre") &&
    typeof aviso.origen === "string"
  );
}

function recibir(valor: unknown) {
  if (!esAviso(valor) || valor.origen === ESTA_PESTANA) return;
  for (const oyente of oyentes) oyente(valor);
}

function canalEntrePestanas() {
  if (canal || typeof BroadcastChannel === "undefined") return canal;
  canal = new BroadcastChannel(CANAL);
  canal.onmessage = (event: MessageEvent) => recibir(event.data);
  return canal;
}

/** Avisa a las otras pestañas del navegador que se inició o cerró sesión. */
export function avisarOtrasPestanas(tipo: AvisoDeSesion["tipo"]): void {
  const aviso: AvisoDeSesion = { tipo, origen: ESTA_PESTANA };
  const abierto = canalEntrePestanas();
  if (abierto) {
    abierto.postMessage(aviso);
    return;
  }
  // Sin BroadcastChannel: el evento "storage" llega a las demás pestañas.
  try {
    localStorage.setItem(
      CLAVE_RESPALDO,
      JSON.stringify({ ...aviso, momento: Date.now() }),
    );
  } catch {
    /* sin almacenamiento: las pestañas comprueban al renovar */
  }
}

/** Escucha los avisos de las otras pestañas. Devuelve cómo dejar de escuchar. */
export function escucharOtrasPestanas(
  oyente: (aviso: AvisoDeSesion) => void,
): () => void {
  oyentes.add(oyente);
  canalEntrePestanas();
  const porStorage = (event: StorageEvent) => {
    if (event.key !== CLAVE_RESPALDO || !event.newValue) return;
    try {
      recibir(JSON.parse(event.newValue));
    } catch {
      /* aviso ilegible */
    }
  };
  const conStorage = typeof window !== "undefined" && !canal;
  if (conStorage) window.addEventListener("storage", porStorage);
  return () => {
    oyentes.delete(oyente);
    if (conStorage) window.removeEventListener("storage", porStorage);
  };
}

/** Usuario (sub) de un access token, sin validarlo: lo valida el servidor. */
export function usuarioDelToken(token: string): string | undefined {
  try {
    const parte = token.split(".")[1];
    if (!parte) return undefined;
    const base64 = parte.replaceAll("-", "+").replaceAll("_", "/");
    const { sub } = JSON.parse(atob(base64)) as { sub?: unknown };
    return typeof sub === "string" ? sub : undefined;
  } catch {
    return undefined;
  }
}

export type ResultadoDeRenovar =
  | { tipo: "ok"; token: string }
  | { tipo: "otro-usuario"; email?: string }
  | { tipo: "vencida" }
  | { tipo: "fallo" };

export type Decision =
  | { accion: "seguir"; token: string }
  | { accion: "pausar"; otroEmail?: string }
  | { accion: "ingresar"; aviso: string }
  | { accion: "reintentar" };

/**
 * Qué hace la pestaña después de intentar renovar. `motivo` es "cierre" si la
 * renovación la disparó otra pestaña que cerró sesión.
 */
export function decidirTrasRenovar(
  esperado: string | undefined,
  resultado: ResultadoDeRenovar,
  motivo?: AvisoDeSesion["tipo"],
): Decision {
  switch (resultado.tipo) {
    case "ok": {
      const usuario = usuarioDelToken(resultado.token);
      // El servidor ya lo controla; si igual llega un token de otro, no se usa.
      if (esperado && usuario && usuario !== esperado)
        return { accion: "pausar" };
      return { accion: "seguir", token: resultado.token };
    }
    case "otro-usuario":
      return { accion: "pausar", otroEmail: resultado.email };
    case "vencida":
      return {
        accion: "ingresar",
        aviso:
          motivo === "cierre"
            ? "Se cerró la sesión en otra pestaña."
            : "La sesión venció. Iniciá sesión nuevamente.",
      };
    case "fallo":
      return { accion: "reintentar" };
  }
}

/* Freno de pedidos: con la pestaña pausada no sale ningún pedido a la API,
 * salvo el ingreso con contraseña desde la pantalla de pausa. */

let pausada = false;

export function pestanaPausada(): boolean {
  return pausada;
}

export function pausarPedidos(): void {
  pausada = true;
}

export function reanudarPedidos(): void {
  pausada = false;
}

export class PestanaPausadaError extends Error {
  constructor() {
    super(
      "Esta pestaña está pausada porque se inició sesión con otro usuario.",
    );
    this.name = "AbortError";
  }
}

/**
 * ¿Se frena este pedido? Con la pestaña pausada sólo sale el ingreso con
 * contraseña desde la pantalla de pausa. Lo usa `apiFetch`.
 */
export function frenaPedido(url: string): boolean {
  if (!pausada) return false;
  const ruta = new URL(url, "http://local").pathname;
  return !ruta.endsWith("/auth/login");
}
