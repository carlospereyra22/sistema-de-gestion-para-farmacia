import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Mapa de la preventa (SISTEMA-108) con OpenStreetMap. Se carga aparte
 * (`lazy`) para que el resto del sistema no lo descargue. Sin conexión no
 * hay mapa: las pantallas siguen funcionando con la lista.
 */

export type PuntoMapa = {
  id: string;
  latitude: number;
  longitude: number;
  titulo: string;
  /** Número de parada en el recorrido. */
  numero?: number;
  hecho?: boolean;
};

const CENTRO_ARGENTINA: L.LatLngTuple = [-34.6037, -58.3816];

function icono(punto: PuntoMapa, elegido: boolean) {
  const fondo = punto.hecho
    ? "bg-emerald-600"
    : elegido
      ? "bg-amber-500"
      : "bg-teal-700";
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    html: `<span class="grid size-[30px] place-items-center rounded-full rounded-br-none rotate-45 ${fondo} shadow-md ring-2 ring-white"><span class="-rotate-45 text-xs font-bold text-white">${punto.numero ?? ""}</span></span>`,
  });
}

export default function PreventaMapa({
  puntos,
  miUbicacion,
  elegido,
  onElegir,
  onTocarMapa,
  alto = "h-72",
}: {
  puntos: readonly PuntoMapa[];
  miUbicacion?: { latitude: number; longitude: number } | null;
  elegido?: string | null;
  onElegir?: (id: string) => void;
  /** Para marcar una ubicación tocando el mapa. */
  onTocarMapa?: (punto: { latitude: number; longitude: number }) => void;
  alto?: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const tocar = useRef(onTocarMapa);
  const elegir = useRef(onElegir);
  tocar.current = onTocarMapa;
  elegir.current = onElegir;

  useEffect(() => {
    if (!contenedor.current) return;
    const nuevo = L.map(contenedor.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(CENTRO_ARGENTINA, 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(nuevo);
    nuevo.on("click", (evento: L.LeafletMouseEvent) =>
      tocar.current?.({
        latitude: Number(evento.latlng.lat.toFixed(6)),
        longitude: Number(evento.latlng.lng.toFixed(6)),
      }),
    );
    capa.current = L.layerGroup().addTo(nuevo);
    mapa.current = nuevo;
    // El contenedor puede medir distinto al abrir una hoja: se recalcula.
    const medir = window.setTimeout(() => nuevo.invalidateSize(), 200);
    return () => {
      window.clearTimeout(medir);
      nuevo.remove();
      mapa.current = null;
    };
  }, []);

  useEffect(() => {
    const actual = mapa.current;
    const grupo = capa.current;
    if (!actual || !grupo) return;
    grupo.clearLayers();
    const limites: L.LatLngTuple[] = [];
    for (const punto of puntos) {
      const posicion: L.LatLngTuple = [punto.latitude, punto.longitude];
      limites.push(posicion);
      L.marker(posicion, {
        icon: icono(punto, punto.id === elegido),
        title: punto.titulo,
        keyboard: true,
      })
        .on("click", () => elegir.current?.(punto.id))
        .bindTooltip(punto.titulo)
        .addTo(grupo);
    }
    if (miUbicacion) {
      const yo: L.LatLngTuple = [miUbicacion.latitude, miUbicacion.longitude];
      limites.push(yo);
      L.circleMarker(yo, {
        radius: 8,
        color: "white",
        weight: 3,
        fillColor: "rgb(37 99 235)",
        fillOpacity: 1,
      })
        .bindTooltip("Estás acá")
        .addTo(grupo);
    }
    if (limites.length === 1) actual.setView(limites[0]!, 16);
    else if (limites.length > 1)
      actual.fitBounds(L.latLngBounds(limites), { padding: [32, 32] });
  }, [puntos, miUbicacion, elegido]);

  return (
    <div
      ref={contenedor}
      role="application"
      aria-label="Mapa"
      className={`${alto} w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100`}
    />
  );
}
