import { useEffect, useRef, useState } from "react";
import {
  getSalesHistory,
  type FiltroHistorialVentas,
  type Sale,
} from "./lib/api";
import { SinConexionError } from "./lib/api-fetch";
import { filtrarHistorialLocal } from "./lib/historial-local";

export const VENTAS_POR_PAGINA = 10;

/**
 * Página del historial de ventas (SISTEMA-104). Con conexión la pide al
 * servidor, que filtra y pagina sobre todas las ventas de la sucursal (antes
 * la web veía solo las últimas 200). Las ventas de la PC sin enviar van
 * arriba de la primera página. Sin conexión filtra la copia local.
 */
export function useHistorialVentas<T extends Sale & { porEnviar?: boolean }>({
  token,
  organizationId,
  branchId,
  filtro,
  page,
  respaldo,
  actualizacion,
}: {
  token: string;
  organizationId: string;
  branchId: string;
  filtro: FiltroHistorialVentas;
  page: number;
  /** Copia local más lo vendido en la PC sin enviar. */
  respaldo: readonly T[];
  /** Cambia cuando hay que volver a pedir la página (anulación, sincronización…). */
  actualizacion: unknown;
}): {
  ventas: (T | Sale)[];
  total: number;
  /** Pidiendo una página; mientras tanto se ve la anterior. */
  cargando: boolean;
  /** Ya llegó alguna respuesta: el total se puede mostrar. */
  listo: boolean;
  sinConexion: boolean;
} {
  const [estado, setEstado] = useState<{
    ventas: Sale[];
    total: number;
    cargando: boolean;
    listo: boolean;
    sinConexion: boolean;
  }>({
    ventas: [],
    total: 0,
    cargando: true,
    listo: false,
    sinConexion: false,
  });
  const clave = JSON.stringify(filtro);
  const claveAnterior = useRef(clave);
  useEffect(() => {
    // Solo un filtro nuevo espera (al tipear un código no sale una consulta
    // por tecla); cambiar de página pide enseguida.
    const espera = claveAnterior.current === clave ? 0 : 250;
    claveAnterior.current = clave;
    let vigente = true;
    setEstado((actual) => ({ ...actual, cargando: true }));
    const timer = window.setTimeout(() => {
      getSalesHistory(
        token,
        organizationId,
        branchId,
        filtro,
        page,
        VENTAS_POR_PAGINA,
      )
        .then((pagina) => {
          if (vigente)
            setEstado({
              ventas: pagina.items,
              total: pagina.total,
              cargando: false,
              listo: true,
              sinConexion: false,
            });
        })
        .catch((causa: unknown) => {
          if (!vigente) return;
          setEstado({
            ventas: [],
            total: 0,
            cargando: false,
            listo: true,
            sinConexion: true,
          });
          if (!(causa instanceof SinConexionError)) console.error(causa);
        });
    }, espera);
    return () => {
      vigente = false;
      window.clearTimeout(timer);
    };
  }, [token, organizationId, branchId, clave, page, actualizacion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (estado.sinConexion) {
    // Sin servidor: la copia local filtrada y paginada en la PC.
    const locales = filtrarHistorialLocal(respaldo, filtro);
    return {
      ventas: locales.slice(
        (page - 1) * VENTAS_POR_PAGINA,
        page * VENTAS_POR_PAGINA,
      ),
      total: locales.length,
      cargando: false,
      listo: true,
      sinConexion: true,
    };
  }
  const registradas = new Set(estado.ventas.map((venta) => venta.id));
  const pendientes = filtrarHistorialLocal(
    respaldo.filter((venta) => venta.porEnviar && !registradas.has(venta.id)),
    filtro,
  );
  return {
    ventas: page === 1 ? [...pendientes, ...estado.ventas] : estado.ventas,
    total: estado.total + pendientes.length,
    cargando: estado.cargando,
    listo: estado.listo,
    sinConexion: false,
  };
}
