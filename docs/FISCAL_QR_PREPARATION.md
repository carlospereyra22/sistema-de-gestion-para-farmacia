# Preparación del QR fiscal

Se agregó `apps/api/src/fiscal/fiscal-qr.ts` como utilidad pura de backend,
sin endpoint ni integración con emisión o impresión todavía. No habilita
producción ni modifica documentos históricos.

Construye la URL y el payload versión 1 según la
[especificación oficial](https://www.arca.gob.ar/fe/qr/documentos/QRespecificaciones.pdf).
Sólo acepta documentos marcados PRODUCTION/AUTHORIZED; el futuro servicio debe
proveerlos desde registros persistidos y conciliados, nunca desde un borrador
enviado por el navegador. Esta validación no verifica por sí sola un CAE en ARCA.

Alcance inicial: pesos, autorización CAE, importes positivos dentro del rango
actual de facturación, receptor CUIT/DNI o sin identificación. Otros documentos,
monedas y CAEA requieren ampliación explícita. Los valores monetarios se reciben
en centavos enteros. No se incluyen claves, certificados ni tokens en el QR.

Pendiente: integrar con documentos productivos, representar la matriz QR en el
ticket, probar lectura física y salida térmica. El circuito productivo continúa
bloqueado. La utilidad no se usa en los comprobantes de homologación.

Pruebas: payload decodificado, tipos numéricos, centavos, receptores, rechazo de
homologación/documentos pendientes, fechas y datos inválidos, límites de importes.
