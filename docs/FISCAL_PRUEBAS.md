# Cómo probar la facturación electrónica (ARCA)

Guía para el equipo. Explica qué es cada cosa, cómo funciona la factura C en el
sistema y cómo probarla en **homologación**, el ambiente de prueba de ARCA.
Nada de esta guía toca producción ni emite facturas con validez fiscal.

## Qué es cada cosa

- **Clave privada (`.key`)**: se genera de nuestro lado (el sistema la genera y
  la guarda cifrada). Nunca se manda a ARCA. Quien la tiene puede facturar por
  ese CUIT: no se comparte ni se sube al repositorio.
- **Certificado (`.crt` / `.pem`)**: lo entrega ARCA a partir de un pedido
  (`.csr`) que sale de la clave privada. Dice "esta clave pertenece a este
  CUIT". Clave + certificado son la "firma" con la que el sistema entra a ARCA.
- **Homologación**: ambiente de prueba de ARCA. Las facturas tienen CAE pero
  **no tienen validez fiscal**. El certificado se saca en **WSASS** y sirve sólo
  para pruebas. Cualquiera con clave fiscal puede sacar uno con su propio CUIT.
- **Producción**: facturas reales. El certificado es otro, se saca en
  "Administración de Certificados Digitales" con la clave fiscal del titular de
  la farmacia. Activarla requiere autorización explícita
  (`PRODUCTION_FISCAL_CHECKLIST.md`).
- **Punto de venta**: número que ARCA asigna a cada lugar desde donde se
  factura. La numeración de facturas es correlativa por punto y tipo.
- **CAE**: código de 14 números que ARCA devuelve al autorizar una factura, con
  fecha de vencimiento. Sin CAE no hay factura.

## Cómo funciona en el sistema

1. La venta, el stock, el cobro y el pedido de factura (**en cola**) se guardan
   juntos. Si ARCA falla, la venta igual queda registrada: nunca repetirla.
2. Después de guardar se envía a ARCA:
   - **Autorizada**: volvió el CAE. Se imprime con QR.
   - **Rechazada**: ARCA dijo que no. Se puede **volver a emitir** desde el
     diálogo de la factura, para la misma venta y con un número nuevo.
   - **Por confirmar**: no se supo la respuesta (corte de red). Traba el punto
     hasta resolverse. Si ARCA tiene el comprobante, se recupera el CAE; si
     pasados 10 minutos ARCA dice que el número no existe, se marca "No llegó a
     ARCA" y se puede volver a emitir. Nunca se libera un número que ARCA tenga.
3. **Cola fiscal automática** (SISTEMA-61): cada minuto la API revisa lo que
   quedó en cola o por confirmar y lo envía sola, del más viejo al más nuevo,
   por punto de venta. Salta ventas anuladas, espera 5 minutos entre reintentos
   y deja un minuto a la venta recién hecha para enviar su propia factura. En
   producción sólo corre con la emisión habilitada. Se apaga con
   `FISCAL_QUEUE_WORKER=off`. En la auditoría queda sin usuario y con
   `origen: AUTOMATICO`.

## Preparar homologación con tu CUIT

Una sola vez por persona:

1. Entrá a ARCA con tu clave fiscal: https://auth.afip.gob.ar/contribuyente_/login.xhtml
2. **Administrador de Relaciones de Clave Fiscal → Adherir servicio → ARCA →
   Servicios interactivos → "WSASS - Autogestión Certificados Homologación"**.
   Confirmá, salí y volvé a entrar.

En el sistema local (`Iniciar Gestion - Pruebas.cmd`):

3. **Organización → Facturación → Configurar facturación → Tu farmacia**: poné
   tu CUIT (con o sin guiones) y "Monotributista". Guardá.
4. **No tengo certificado**: en "CUIT de la persona que ingresa a WSASS" poné tu
   CUIT y tocá **Descargar mi solicitud** (`.csr`). No hace falta OpenSSL.

En WSASS:

5. **Nuevo Certificado**: un nombre (por ejemplo `gestion-pruebas`) y pegá el
   contenido del `.csr`. Guardá el texto que devuelve como `certificado.pem`.
6. **Crear autorización a servicio**: tu certificado, tu CUIT como
   representado y el servicio **wsfe**.

De vuelta en el sistema:

7. Subí `certificado.pem` y tocá **Probar conexión con ARCA**. Si no aparecen
   puntos de venta (error 602) es normal en homologación: escribí `1`.

## Probar desde la pantalla

- **Factura de prueba de $100** (Conexión ARCA): no mueve stock ni caja.
- **Venta con "Factura · prueba"** en Ventas: mueve stock y caja de la base
  local; el comprobante dice SIN VALIDEZ FISCAL. Se reimprime desde
  Ventas → Historial.

## Probar desde la consola

Para comprobar ARCA de punta a punta sin la pantalla. Usa la credencial de
homologación de la base local y se niega a correr contra otra base:

```powershell
pnpm --filter @gestion/api build
pnpm --filter @gestion/api fiscal-prueba conexion
pnpm --filter @gestion/api fiscal-prueba emitir
```

- `conexion`: certificado, puntos y último número autorizado. No emite nada.
- `emitir`: una factura C de $1 a consumidor final y la consulta de vuelta.
- Si hay varias organizaciones con certificado: `--organizacion <id o nombre>`.
  Otro punto: `--punto <número>`.

Resultado esperado de `emitir`:

```
1. Certificado aceptado por ARCA homologación (WSAA).
2. Puntos informados por ARCA: ninguno (normal en homologación). Se usa el 1.
3. Último comprobante C autorizado en el punto 1: 3.
4. Factura 00001-00000004 autorizada. CAE 86451064025662, vence 20261117.
5. Consulta en ARCA: el comprobante existe y coincide. Todo OK.
```

Estas facturas no se guardan en el sistema: sólo prueban la conexión.

## Qué mirar

- **CAE**: 14 números. **Vencimiento**: fecha posterior a la factura.
- **Número**: `punto-número`, correlativo. Si ARCA ya tiene el 3, el próximo es el 4.
- **QR**: apunta a `https://www.arca.gob.ar/fe/qr/?p=...`, que redirige a la
  verificación oficial `serviciosweb.afip.gob.ar/genericos/comprobantes/cae.aspx`
  (comprobado el 07/11/2026; `afip.gob.ar/fe/qr/` redirige igual). Falta
  escanear uno impreso con el celular. En homologación no se imprime QR.
- **Nota de crédito** (producción): referencia a la factura original.

## Simular un corte (sólo base local)

Para ver "No llegó a ARCA" y "Volver a emitir" sin cortar la red: tomar la
última factura de prueba de una venta y dejarla por confirmar, con un número
que ARCA no tiene y como si hubieran pasado 11 minutos:

```sql
UPDATE "FiscalTrial" SET status = 'UNCERTAIN', number = COALESCE(number, 0) + 500,
  cae = NULL, "caeExpires" = NULL, "updatedAt" = now() - interval '11 minutes'
WHERE id = (SELECT id FROM "FiscalTrial" WHERE "sourceSaleId" IS NOT NULL
            ORDER BY "createdAt" DESC LIMIT 1);
```

Después abrir esa venta y tocar **Consultar resultado** (o esperar a la cola).
Nunca correr esto fuera de `gestion_dev`.

## Problemas frecuentes

- **"En WSASS autorizá el alias para el servicio wsfe"**: falta el paso 6.
- **"El certificado no fue aceptado por homologación"**: se subió un
  certificado de producción o de otro CUIT.
- **"ARCA ya emitió un acceso vigente"** (`alreadyAuthenticated`): otra
  instalación pidió acceso con el mismo certificado. Esperar a que venza
  (hasta 12 horas) o usar la misma base.
- **"Cambió el CUIT de la farmacia"**: el CUIT del perfil no es el del
  certificado.
- **"Hay un comprobante sin confirmar en este punto"**: esperar a la cola o
  tocar Consultar resultado; a los 10 minutos se resuelve.

## Producción

- No se prueba en producción. Un CAE de producción es una factura real.
- Para ver el estado sin emitir: Organización → Facturación → Facturación real
  · Producción → Verificar producción (consulta puntos; no emite).
- El servidor sólo emite con `FISCAL_PRODUCTION_ISSUANCE=enabled`; el entorno
  local fuerza `FISCAL_LOCAL_TESTING=true`, que bloquea toda llamada a
  producción.
