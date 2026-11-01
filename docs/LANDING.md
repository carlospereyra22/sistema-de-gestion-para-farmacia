# Landing comercial (`apps/landing`)

Sitio publico de Farmatec (nombre provisorio): presenta el producto, lleva a
"Pedi una demo" por WhatsApp y a "Ingresar" (pantalla de ingreso del sistema).
Es una app aparte del sistema: no comparte codigo de negocio ni sesion y se publica
en su **propio sitio de Netlify**, nunca en el sitio de produccion
`sistema-de-gestion22`.

## Desarrollo

```powershell
pnpm dev:landing   # http://localhost:5174
```

Stack igual a `apps/web` (React 19, Vite 7, Tailwind 4, lucide-react, Vitest) y
la misma paleta verde/teal. Esta incluida en `pnpm lint`, `typecheck`, `test` y
`build` del monorepo.

- `src/site.ts`: nombre, direccion del sistema y **datos de contacto de ejemplo**
  (WhatsApp, email, Instagram). Reemplazarlos antes de publicar.
- `src/content.ts`: textos de beneficios, funciones, pasos y preguntas. Solo
  funciones que el sistema ya tiene; sin testimonios, clientes ni cifras inventadas.
- `src/landing.tsx`: secciones (inicio, beneficios, funciones, como empezar,
  preguntas, contacto, pie) y boton flotante de WhatsApp.

## Publicar

1. Completar los datos reales en `src/site.ts`.
2. Compilar con la direccion del sistema:
   ```powershell
   $env:VITE_APP_URL = "https://sistema-de-gestion22.netlify.app"
   pnpm --filter @gestion/landing build
   ```
   Sin `VITE_APP_URL`, "Ingresar" apunta a `http://localhost:5173` (desarrollo).
3. La entrega local se prepara en `SUBIR A PRODUCCION LANDING`. Crear un sitio
   **nuevo** en Netlify y subir esa carpeta con Netlify Drop, igual que la web
   del sistema. No usar el sitio de produccion.

El dominio propio queda para mas adelante: la landing puede arrancar en un
subdominio `netlify.app`.

## Pendiente (epic Landing page comercial en Trello)

Rediseno del login con el encabezado del sitio, pagina de Planes, legales
publicados, SEO completo (sitemap, Search Console) y dominio.
