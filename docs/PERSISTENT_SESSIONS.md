# Sesión persistente del navegador

Por decisión del usuario, las nuevas sesiones no vencen por inactividad en el servidor (`AuthSession.expiresAt=null`). Las sesiones antiguas aún válidas se convierten al renovar; no se reactivan sesiones vencidas ni revocadas. La migración solo permite null, no altera registros existentes.

Los JWT de acceso siguen durando 15 minutos, con renovación cada 12 minutos y al volver a la pestaña. Se conserva el identificador y secreto de renovación durante la sesión: no se revoca/rota en cada renovación, evitando cierres por pestañas concurrentes o una respuesta de renovación perdida. El secreto sigue hasheado en la base y en cookie HttpOnly, SameSite Strict, Secure en producción. Este cambio implica que un secreto de renovación robado es reutilizable hasta revocar la sesión; se debe cerrar sesión en equipos compartidos.

La cookie tiene 400 días y su plazo se renueva en cada respuesta exitosa. La persistencia no se garantiza si se borran cookies, se usa modo privado, el navegador elimina datos, se deshabilita el usuario o se revoca la sesión. Cerrar sesión revoca en el servidor y borra la cookie. Cambiar la propia contraseña cierra las demás sesiones del usuario y conserva la actual. La revocación sigue siendo comprobada en cada petición autenticada.

Solo un 401 explícito del endpoint de renovación limpia la sesión del frontend. Fallos de red/servidor conservan el estado y reintentan cada 15 segundos; las operaciones siguen necesitando autorización del servidor y no se simula éxito offline. La restauración inicial también reintenta ante fallos temporales. No se deshabilita la seguridad del backend.

Modo sin internet (07/11/2026, SISTEMA-62): si la renovación falla por falta de conexión, la web puede abrir con el perfil guardado del último usuario de la PC (hasta 24 h desde la última sincronización) y un token local que nunca llega al servidor; sólo muestra datos guardados. Un 401 de renovación sigue cerrando la sesión y además borra la copia local. Ver `OFFLINE.md`.

Aplicado en pruebas locales; producción requiere migración y despliegue. No se cambiaron credenciales ni se recuperaron sesiones revocadas.
