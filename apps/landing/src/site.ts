/**
 * Datos del sitio. Los de contacto son DE EJEMPLO: reemplazarlos antes de publicar.
 * El nombre comercial es provisorio.
 */
export const site = {
  name: "Farmatec",
  tagline: "Sistema de gestión para farmacias",
  /** Direccion del sistema (login). En el build de publicacion: VITE_APP_URL. */
  appUrl: import.meta.env.VITE_APP_URL ?? "http://localhost:5173",
  contact: {
    /** Formato internacional sin "+" ni espacios (ej. 5493511234567). EJEMPLO. */
    whatsapp: "5490000000000",
    email: "contacto@ejemplo.com",
    instagram: "https://www.instagram.com/",
  },
  demoMessage: "Hola, quiero conocer Farmatec para mi farmacia.",
} as const;

export const whatsappUrl = (message: string = site.demoMessage) =>
  `https://wa.me/${site.contact.whatsapp}?text=${encodeURIComponent(message)}`;
