# Clientes

El directorio ocupa todo el ancho disponible. Seleccionar una fila abre una ficha lateral; cerrarla recupera el ancho de la tabla. En pantallas pequeñas el detalle se coloca arriba del listado.

Incluye búsqueda por nombre, documento, teléfono, correo o referencia de ficha, filtro de lista de precios, clientes eliminados y paginación. La ficha es una referencia abreviada del identificador existente, no una numeración comercial nueva.

Alta y edición comparten un modal con datos principales, facturación, datos adicionales, contacto y observaciones opcionales de hasta 1000 caracteres. Las observaciones se validan en servidor y se guardan mediante las transacciones y auditoría existentes; vacío las elimina y omitir el campo las conserva. Requiere la migración `20261022010000_customer_notes`. El alta también está disponible desde Cuentas corrientes con el mismo modal; ver `ACCOUNT_DUE_DATES.md`.

El teléfono se carga con un selector de país (+54 por defecto, con "Otro país" para cualquier otro código) y el número aparte; se guarda en un solo campo con el código, por ejemplo `+54 9 376 412-3456`, que es lo que necesita el enlace de WhatsApp. Un número pegado con `+` elige el país solo. Los teléfonos cargados sin código se muestran como Argentina y se guardan con +54 al guardar la ficha. Lo mismo vale para Proveedores. La lógica está en `apps/web/src/lib/phone-number.ts`; no cambia la API ni la base.

Se conservan los permisos PARTY_READ/PARTY_MANAGE, la prevención de documentos duplicados, la confirmación de homónimos y la baja lógica/restauración. No modifica saldos, condiciones de crédito ni datos fiscales históricos. Las notificaciones de éxito usan el aviso temporal inferior derecho.

## CUIT primero y búsqueda en ARCA (09/11/2026, SISTEMA-70)

> **Estado: oculto, pendiente de terminar.** El código está subido pero la pantalla no lo muestra: se prende con `BUSQUEDA_ARCA` en `apps/web/src/lib/funciones-ocultas.ts` (botón “Buscar en ARCA” en el alta de clientes y pestaña “ARCA” del panel de plataforma). Falta probarlo de punta a punta: en homologación ARCA respondió `coe.notAuthorized` porque el certificado no tenía autorizado `ws_sr_constancia_inscripcion`.
>
> **Decisión del usuario (09/11/2026): la consulta se hace con un certificado de Farmatec (CUIT 20247237837)**, no con el de cada farmacia, para que ande en todas sin que configuren nada. Se carga desde el panel de plataforma (pestaña ARCA: generar solicitud, subirla a ARCA, cargar el certificado), tabla `PlatformPadronCredential` (migración `20261109150000_padron_plataforma`), servicio `platform/platform-padron.service.ts`. Si no hay certificado de Farmatec, usa el de la farmacia (`fiscal/padron.service.ts`). Para terminar: generar la solicitud en homologación desde el panel, crear el certificado en WSASS, autorizarlo para `ws_sr_constancia_inscripcion`, cargarlo, prender el interruptor y probar; agregar un test de integración del panel y de la consulta (con ARCA simulado).

- El modal arranca por el CUIT/CUIL/DNI. **Buscar en ARCA** (o Enter) completa nombre o razón social, condición frente al IVA y domicilio fiscal desde el padrón oficial de ARCA (servicio `ws_sr_constancia_inscripcion`, `getPersona_v2`). Los datos se revisan antes de guardar; nada se guarda solo.
- API: `GET organizations/:org/fiscal/padron/:cuit` (PARTY_MANAGE). Sólo CUIT/CUIL de 11 dígitos con dígito verificador válido; con un DNI no se puede buscar. Usa el certificado de la farmacia: el de producción si está cargado (nunca en el entorno local de pruebas) y si no el de homologación. Sólo consulta: no emite nada.
- Cada farmacia tiene que asociar el servicio `ws_sr_constancia_inscripcion` a su certificado en ARCA (Administrador de Relaciones). Si falta, el mensaje lo indica. El acceso de ARCA para ese servicio se guarda cifrado aparte del de facturación (`FiscalCredential.encryptedPadronTicket`, migración `20261109140000_padron_arca`): ARCA no repite el acceso hasta que vence.
- Condición frente al IVA: monotributo → Monotributista; impuesto 30 (IVA) → Responsable inscripto; 32 (IVA exento) → Exento; sin ninguno → Consumidor final.
- Sin conexión el botón queda deshabilitado y los datos se cargan a mano.
- **El CUIT/DNI identifica al cliente**: uno repetido no deja guardar (también eliminados, con o sin puntos y guiones). Un nombre repetido con distinto CUIT sólo se informa; sin CUIT para comparar se pide confirmar que es otra persona.
