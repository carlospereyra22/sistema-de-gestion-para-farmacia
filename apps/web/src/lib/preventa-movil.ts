import { createContext, useContext } from "react";

/**
 * ¿La preventa se muestra en la versión celular? (SISTEMA-108). En el
 * celular el detalle del pedido es una página completa con menú ⋮; en la PC,
 * una ventana.
 */
export const PreventaMovilContexto = createContext(false);

export const useEsMovil = () => useContext(PreventaMovilContexto);
