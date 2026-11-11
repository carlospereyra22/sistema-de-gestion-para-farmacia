import { useEffect, useRef, useState } from "react";
import {
  MOVIMIENTO,
  prefiereMenosMovimiento,
  valorAnimado,
} from "./animacion-reportes";

// Hooks de movimiento de Reportes (SISTEMA-90): la primera aparición de un
// bloque en pantalla y un número que cuenta hasta su valor. Sólo presentación.

/**
 * Estado de la aparición de un bloque:
 * - `pendiente`: hay entrada animada pero todavía no se vio (queda invisible).
 * - `entrando`: entró en pantalla; corre su animación y la de sus filas.
 * - `lista`: estable. Lo que cambie después no repite la entrada.
 */
export type EstadoEntrada = "pendiente" | "entrando" | "lista";

/**
 * Primera vez que el bloque entra en pantalla (10–20 % visible). Sin entrada
 * animada está `lista` desde el principio; un re-render, el scroll o un cambio
 * de tamaño no la repiten.
 */
export function useEntrada<T extends Element>(animar: boolean) {
  const ref = useRef<T>(null);
  const [estado, setEstado] = useState<EstadoEntrada>(
    animar ? "pendiente" : "lista",
  );
  useEffect(() => {
    if (estado !== "pendiente") return;
    const elemento = ref.current;
    if (!elemento || typeof IntersectionObserver === "undefined") {
      setEstado("entrando");
      return;
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) {
          observador.disconnect();
          setEstado("entrando");
        }
      },
      { threshold: 0.12 },
    );
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [estado]);
  useEffect(() => {
    if (estado !== "entrando") return;
    const fin = window.setTimeout(
      () => setEstado("lista"),
      MOVIMIENTO.entradaPanel,
    );
    return () => window.clearTimeout(fin);
  }, [estado]);
  return [ref, estado] as const;
}

/**
 * Número que se anima hacia `destino`:
 * - con `entrada`, la primera vez cuenta desde 0 (cuando `listo`, tras
 *   `retraso` ms) durante `duracionEntrada`;
 * - después, si el destino cambia (un filtro), va desde lo que se ve al nuevo
 *   valor en una transición corta, también hacia abajo;
 * - si el destino cambia a mitad de camino, cancela y sigue desde donde está.
 * Con "reducir movimiento" muestra el valor final directo.
 */
export function useNumeroAnimado(
  destino: number,
  {
    entrada,
    listo = true,
    retraso = 0,
    duracionEntrada = MOVIMIENTO.contadorEntrada,
  }: {
    entrada: boolean;
    listo?: boolean;
    retraso?: number;
    duracionEntrada?: number;
  },
) {
  const [mostrado, setMostrado] = useState(entrada ? 0 : destino);
  const actual = useRef(mostrado);
  // Se marca al dibujar el primer cuadro: así el doble efecto de React en
  // desarrollo no convierte la entrada en una actualización.
  const entro = useRef(!entrada);
  useEffect(() => {
    if (!listo) return;
    const desde = actual.current;
    if (desde === destino) {
      entro.current = true;
      return;
    }
    if (prefiereMenosMovimiento()) {
      entro.current = true;
      actual.current = destino;
      setMostrado(destino);
      return;
    }
    const esEntrada = !entro.current;
    const duracion = esEntrada
      ? duracionEntrada
      : MOVIMIENTO.contadorActualizacion;
    const espera = esEntrada ? retraso : 0;
    let cuadro = 0;
    let inicio: number | undefined;
    const paso = (ahora: number) => {
      inicio ??= ahora;
      entro.current = true;
      const valor = valorAnimado(
        desde,
        destino,
        ahora - inicio,
        duracion,
        espera,
      );
      actual.current = valor;
      setMostrado(valor);
      if (valor !== destino) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [destino, listo, retraso, duracionEntrada]);
  return mostrado;
}
