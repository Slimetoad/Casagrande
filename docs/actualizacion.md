# Actualización del portal y mantenimiento

Aplica las migraciones D1 numeradas en orden, de `0000_plataforma_admisiones.sql` a `0003_contenido_openseo.sql`, sobre una copia de verificación antes de actualizar la instalación operativa. Conserva el historial de expedientes y trabajos. La última migración añade las fuentes de OpenSEO, el plan editorial, el registro de publicación institucional y la medición de guías.

## Programación por ámbito

El programador ejecuta una petición HTTPS por ámbito cada hora. El piloto usa una sola tarea que consulta ambos ámbitos por separado. Envía el secreto `MAINTENANCE_TOKEN` en `X-UCG-Mantenimiento`. Si el alojamiento Sites también exige autorización de servicio, usa la credencial vigente en `OAI-Sites-Authorization: Bearer <credencial-de-Sites>`. Guarda las credenciales con el gestor de secretos del programador.

| Ruta | Proceso | Ventana y resultado |
| --- | --- | --- |
| `/api/maintenance/editorial` | `editorial_openseo` | Registro horario con una actualización gratuita completada por día como máximo. |
| `/api/maintenance/editorial` | `editorial_publicacion` | Registro horario. Actualiza el plan cuando corresponde, procesa hasta una guía automática vencida y comprueba la cola de publicación institucional. |
| `/api/maintenance/editorial` | `editorial_captacion` | Registro diario en UTC. Actualiza la medición de campañas activas. |
| `/api/maintenance/editorial` | `editorial_limpieza` | Registro horario. Retira límites temporales vencidos e historial técnico de ejecuciones de más de cien días. |
| `/api/maintenance/nuevos` | `nuevos_seguimiento` | Registro horario. Atiende trabajos nuevos con autorización, canal, etapa y horario elegibles. |
| `/api/maintenance/nuevos` | `nuevos_conversaciones` | Registro horario. Atiende acciones nuevas originadas en conversaciones verificadas de correo o voz. |

Sustituye los disparadores que hacían `POST /api/maintenance`. Esa ruta devuelve `410` e indica las dos rutas nuevas. `GET /api/maintenance` conserva el historial general. En cada ámbito, `GET` con las mismas cabeceras devuelve las tres ejecuciones más recientes de cada proceso y los recuentos agregados disponibles. La respuesta de `/nuevos` incluye además el inicio de la ventana de activación.

El orden editorial es lectura de OpenSEO, publicación, medición de captación y limpieza. Cada proceso registra su propio resultado. La falta de conexión a una fuente deja disponibles el catálogo y las demás evidencias. Las ventanas del registro se calculan en UTC. Las guías se distribuyen en el calendario de Guayaquil, con hasta tres fechas por semana y al menos 20 horas entre fechas programadas.

### Seguimiento de trabajos nuevos

`POST /api/maintenance/nuevos` requiere `OUTREACH_START_AT` con fecha, hora y zona en ISO 8601. Un valor ausente o inválido devuelve `409`. El límite compara el momento de creación del trabajo o del ingreso al flujo, antes de aplicar permisos y etapa. Los trabajos anteriores siguen disponibles para revisión. `OUTREACH_ENABLED=false` pausa el despacho; el permiso vigente, la etapa, las bajas y las restricciones del canal siguen decidiendo la elegibilidad. WhatsApp necesita también `OUTREACH_WHATSAPP_ENABLED=true` y plantillas aprobadas.

Una solicitud nueva con bienvenida autorizada por correo o WhatsApp puede activar una pasada rápida de hasta tres trabajos, con un intervalo mínimo de 15 segundos y el orden de vencimiento de la cola. Un ingreso autenticado de conversación también puede activar una pasada acotada. El programador atiende lo pendiente. Las llamadas conservan su horario previsto.

### Interpretación de estados

| Señal verificable | Lectura |
| --- | --- |
| `completado` | El proceso terminó. Revisa los recuentos para saber si hubo trabajo elegible, guías publicadas o confirmaciones del CMS. |
| `sin_configurar` / `en_pausa` | Faltan dependencias o la configuración mantiene inactivo el proceso. En OpenSEO, `en_pausa` también puede indicar que la lectura reciente sigue vigente. |
| `ya_procesado` | La ventana ya tiene una ejecución registrada o en curso. |
| `error` / HTTP `503` | Un proceso registró un fallo. Consulta los demás resultados del ámbito y revisa la causa antes de reintentar. Una ejecución en curso que quedó abandonada se puede recuperar tras 20 minutos. |
| `accepted` / `review` | El proveedor aceptó el trabajo o el envío requiere revisión. Comprueba los webhooks para verificar entregas, respuestas o bajas. |
| `publishedPortal` / `publishedCms` | El primer contador corresponde al portal y el segundo a confirmaciones de la versión en el CMS. `verificationFailures` cuenta fuentes institucionales que requirieron revisión previa. |

## Configurar OpenSEO y Search Console

Solicita una clave de API del espacio de OpenSEO que contiene el proyecto de posgrados. Pide al titular de Search Console que conecte al proyecto la propiedad verificada del dominio que se quiere medir. Guarda la clave en `OPENSEO_API_KEY`. Si usas un token de acceso, el adaptador acepta `OPENSEO_ACCESS_TOKEN`. Elige `OPENSEO_PROJECT_ID` para desambiguar y `OPENSEO_DOMAIN` cuando el proyecto requiera un dominio explícito. El endpoint alojado predeterminado es `https://app.openseo.so/mcp`. Para una instancia autorizada, usa `OPENSEO_MCP_URL` y la cabecera compatible mediante `OPENSEO_AUTH_HEADER` (`bearer` o `x-api-key`). [Configuración oficial de OpenSEO MCP](https://openseo.so/docs/mcp)

El ciclo descubre las herramientas anunciadas por el servidor y admite hasta doce llamadas gratuitas por sincronización. Importa palabras ya guardadas, posiciones y auditorías existentes y la propiedad conectada de Search Console. La política fija un presupuesto de **0 créditos** por consultas con cargo. Search Console se filtra a Ecuador. Las palabras guardadas y el seguimiento de posiciones requieren una configuración de Ecuador y español. El tablero distingue mercados, dispositivos y fechas de cada observación. La configuración directa de Search Console y Semrush es independiente y puede sincronizarse desde la mesa de contenidos. [Herramientas y créditos de OpenSEO](https://openseo.so/docs/mcp-tools)

El 22 de noviembre de 2026 se registraron 17 consultas exactas con Ecuador seleccionado en el generador público. Son seis de Inteligencia Artificial y Analítica de Datos, cuatro de Administración de Empresas, tres de Educación Inclusiva y cuatro generales. Sirven como evidencia inicial para un catálogo de 34 programas. Cada volumen es una estimación para esa consulta. Las impresiones, los clics, la posición y las tendencias requieren observaciones de sus respectivas fuentes. [OpenSEO Keyword Generator](https://openseo.so/keyword-generator)

El personal puede abrir **Plan editorial** o consultar `GET /api/staff/openseo?programa=<slug>` para verificar la fuente y la fecha. `disponible` significa que hay datos aplicables, `sin_datos` que la lectura no aportó filas de ese programa, `pendiente` que resta una lectura y `bloqueado` que se aplica el límite de consumo. `no_disponible`, `sin_configurar` y `error` requieren revisar la propiedad, las credenciales o el proveedor. Una cifra observada de cero se conserva. El plan usa la señal de búsqueda con mayor peso para cada programa, junto con interés del CRM y cobertura editorial; las estimaciones de volumen y las impresiones observadas se muestran por separado.

## Piloto, guías y sitio institucional

El piloto conserva su identificación pública. Verifica las propuestas y fuentes en `/motor-de-contenidos`, las guías publicadas en `/guias` y el circuito de edición, programación o pausa en el área privada `/equipo`. La demostración de `/crm` y la muestra editorial se ejecutan con datos de ejemplo. La publicación y la indexación son decisiones independientes. El origen canónico se configura en `PUBLIC_BASE_URL`; `SEO_INDEXABLE=true` se reserva para el origen aprobado. `INSTITUTIONAL_LIVE=true` cambia la identificación del piloto después de la adopción formal.

El equipo puede publicar una guía revisada desde su consola. `SEO_EDITORIAL_AUTOPUBLISH=true` activa la publicación de guías programadas y habilitadas con fuente institucional. La pausa editorial y la elegibilidad de cada guía prevalecen sobre esa activación. `SEO_EDITORIAL_LIVE_SOURCE_CHECK=true` exige una comprobación HTTP adicional de la ficha académica. La ficha del catálogo respalda los datos académicos; los proveedores de SEO aportan señales de búsqueda.

Para el sitio institucional, solicita al equipo de UCG el endpoint HTTPS oficial del CMS en `casagrande.edu.ec` o un subdominio y el token de publicación autorizado. Configúralos como `SEO_INSTITUTIONAL_CMS_URL` y `SEO_INSTITUTIONAL_CMS_TOKEN`. El flujo registra primero la publicación del portal y luego solicita la réplica de la misma versión al CMS. El enlace oficial se acredita mediante el comprobante verificable del CMS. Si el resultado es incierto, concilia el identificador y la versión antes de reintentar. [Contrato de publicación institucional](publicacion-editorial.md)

Antes de habilitar el seguimiento, comprueba las firmas, los permisos por canal y las bajas con pruebas controladas. El estado del correo se consulta en `/equipo/conexiones` y la bandeja conserva los ingresos de correo y voz. Un trabajo con resultado incierto se concilia con el proveedor antes de repetirse. [Procedimiento de recepción y verificación](respuestas-admisiones.md)
