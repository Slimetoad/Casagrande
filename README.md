# Posgrados · Universidad Casa Grande

Portal público para explorar programas, recibir orientación, solicitar información y gestionar una cita; incluye una consola privada de admisiones. El catálogo contiene fichas tomadas de fuentes UCG, no una garantía de convocatoria abierta. La universidad debe confirmar nombres, mallas, precios, fechas y disponibilidad de cada cohorte.

## Recorridos y equipo

| Ruta | Uso |
| --- | --- |
| `/`, `/programas`, `/programas/{slug}` | Inicio, catálogo y fichas con fuentes oficiales |
| `/orientacion`, `/financiamiento`, `/solicitar` | Orientación, simulación de presupuesto y consulta |
| `/cita` | Reservar una franja publicada o solicitar una propuesta de horario |
| `/guias`, `/guias/{slug}` | Guías publicadas en el portal |
| `/plataforma` | Recorridos públicos y acceso a las demostraciones |
| `/crm`, `/equipo?demo=1` | CRM de demostración con expedientes ficticios |
| `/motor-de-contenidos` | Plan editorial público, guías publicadas, fuentes de búsqueda y demostración aislada |
| `/equipo`, `/equipo/manual` | Consola y manual del personal autorizado |
| `/equipo/verificacion`, `/equipo/conexiones` | Verificación operativa y diagnóstico privado de canales |

Una cita reservada ocupa una franja de la agenda local; solicitar una propuesta no confirma horario. El enlace privado permite consultar o cancelar la solicitud. La agenda no comprueba calendarios externos en vivo. En el expediente se asignan responsable y tareas, se registran bloqueos y se avanza por etapas. Admitido y Matriculado requieren referencias institucionales; la matrícula verificada no se infiere de una consulta ni de una cita.

El tablero de fichas muestra actividad de los últimos 30 días y un experimento de dos textos de consulta. Sus exposiciones y clics son eventos agregados; las solicitudes atribuidas dependen de la información conservada por el navegador. Las columnas pueden incluir cohortes diferentes y no prueban causalidad. Las campañas de captación se proponen, revisan y activan por personal; no compran publicidad ni publican anuncios automáticamente.

## Configuración

Guardar credenciales como secretos del servidor; no incluirlas en código ni registros. La plataforma se publica en modo piloto. `INSTITUTIONAL_LIVE=true` permite retirar el aviso de piloto tras la adopción formal por la universidad. Configurar D1 y aplicar las migraciones numeradas en orden, sin reescribir `0000`. Verificar respaldo y procedimiento de actualización antes de aplicarlas a datos existentes.

| Función | Valores y comprobaciones |
| --- | --- |
| Acceso del equipo | `ADMISSIONS_STAFF_EMAILS` lista correos autorizados; `ADMISSIONS_STAFF_TOKEN` es opcional para clientes internos. La identidad debe venir de un proxy confiable que quite cabeceras de identidad suministradas por visitantes y bloquee accesos que lo eludan. En otro alojamiento integrar SSO institucional. En Railway, el Admin (`/admin/`) usa las rutas `/api/admin/*`, que exigen `Authorization: Bearer <ADMISSIONS_STAFF_TOKEN>`. El token debe tener al menos 32 caracteres aleatorios (por ejemplo `openssl rand -base64 48`); sin él todas esas rutas responden 401. El equipo lo ingresa al abrir el Admin y queda solo en `sessionStorage` de la pestaña; nunca va en `site/config.json` ni en el build de Pages. Las cabeceras de identidad del proxy se descartan salvo con `TRUSTED_IDENTITY_PROXY=true`. Las antiguas rutas `/api/public/crm*` y `/api/public/admin/*` responden 401 (o 410 con credencial). |
| Origen y SEO | `PUBLIC_BASE_URL` es el origen HTTPS canónico. `SEO_INDEXABLE=true` habilita indexación en ese origen. Confirmar contenido y dominio antes de activarla. |
| Modelos opcionales | `LLM_PROVIDER` puede ser `openai`, `anthropic` o `google`; configurar respectivamente `OPENAI_API_KEY` y `OPENAI_MODEL`, `ANTHROPIC_API_KEY` y `ANTHROPIC_MODEL`, o `GEMINI_API_KEY` y `GEMINI_MODEL`. Sin modelo quedan disponibles las respuestas basadas en catálogo. |
| Correo | `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET` y, para respuestas, `RESEND_REPLY_DOMAIN` y credenciales de recepción. Ver [recepción de respuestas](docs/respuestas-admisiones.md). |
| Voz | `OUTREACH_VOICE_PROVIDER=twilio` usa `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`; `retell` usa `RETELL_API_KEY`, `RETELL_FROM` en E.164, `RETELL_AGENT_ID` y opcionalmente `RETELL_AGENT_VERSION` y `RETELL_WEBHOOK_KEY`. Configurar el agente publicado y el webhook de Retell en español. Solo se selecciona un proveedor de voz. |
| WhatsApp | `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_GRAPH_VERSION` y al menos una plantilla aprobada: `WHATSAPP_TEMPLATE_WELCOME`, `WHATSAPP_TEMPLATE_GUIDANCE`, `WHATSAPP_TEMPLATE_APPLICATION` o `WHATSAPP_TEMPLATE_ADMISSION`. `WHATSAPP_TEMPLATE_LANGUAGE` por defecto es `es`. Registrar el webhook HTTPS `/api/webhooks/whatsapp`. |
| Seguimiento | `OUTREACH_ENABLED=true` habilita la cola de canales configurados; WhatsApp requiere también `OUTREACH_WHATSAPP_ENABLED=true`. `OUTREACH_BATCH_SIZE` limita la pasada. Configura `OUTREACH_START_AT` con fecha, hora y zona horaria para enviar solo trabajos creados a partir de ese momento. Los permisos son independientes por canal y la etapa debe permitir el mensaje. |
| OpenSEO | Solicitar una clave de API del espacio de trabajo que contiene el proyecto de posgrados y pedir al titular que vincule la propiedad de Search Console autorizada. Guardar `OPENSEO_API_KEY` como secreto. Usar `OPENSEO_PROJECT_ID` si hay varios proyectos compatibles y `OPENSEO_DOMAIN` si el dominio requiere selección explícita. El proyecto y el seguimiento de posiciones deben corresponder a Ecuador y español para importar palabras guardadas y posiciones. |
| Búsqueda directa | `GSC_SITE` identifica la propiedad verificada para Search Console. Configurar `GSC_ACCESS_TOKEN` o `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REFRESH_TOKEN`. Semrush es opcional y usa `SEMRUSH_API_KEY`, `SEMRUSH_DOMAIN` y `SEMRUSH_DATABASE`. Estas fuentes se pueden sincronizar desde la sección de contenidos del equipo. |
| Plan editorial | `SEO_EDITORIAL_AUTOPUBLISH=true` activa el calendario automático. La guía debe estar habilitada, con fecha vencida y fuente institucional verificable. `SEO_EDITORIAL_LIVE_SOURCE_CHECK=true` comprueba la fuente por HTTP antes de publicar. `SEO_AUTODRAFT` corresponde al flujo de borradores de oportunidades. |
| CMS institucional | Solicitar al equipo de la universidad el endpoint oficial HTTPS y un token de servicio autorizado para publicar. Configurar `SEO_INSTITUTIONAL_CMS_URL` y guardar `SEO_INSTITUTIONAL_CMS_TOKEN` como secreto. El portal registra la publicación y el CMS confirma la versión de forma independiente. [Contrato del CMS](docs/publicacion-editorial.md) |
| Programador | `MAINTENANCE_TOKEN` protege las rutas de mantenimiento. Configurar los dos ciclos horarios con el detalle de [actualización](docs/actualizacion.md). |

Configurar en los proveedores los webhooks HTTPS correspondientes: `/api/webhooks/resend`, `/api/webhooks/twilio/status/{id}` y `/api/webhooks/twilio/menu/{id}` generados para cada llamada, `/api/webhooks/retell` y `/api/webhooks/whatsapp`. Aprobar remitentes, plantillas y textos, comprobar firmas y bajas y hacer pruebas controladas con destinatarios internos autorizados antes de habilitar envíos. Una aceptación del proveedor no equivale a entrega ni a conversación. Una petición de resultado incierto requiere conciliación antes de repetirla.

Para llamar a Ecuador con Retell, `RETELL_FROM` debe ser un número importado con un proveedor de telefonía SIP que permita la salida a `+593`. Los números comprados a Retell para la API de llamadas tienen destinos limitados a Estados Unidos. Antes de seleccionar Retell y habilitar el seguimiento, comprobar la conexión SIP y probar la ruta con un número interno ecuatoriano autorizado. [API de llamadas de Retell](https://docs.retellai.com/api-references/create-phone-call) · [Conectar telefonía SIP](https://docs.retellai.com/deploy/custom-telephony).

Cuando entra un expediente nuevo con una bienvenida autorizada y el correo o WhatsApp están habilitados, el servidor procesa hasta tres trabajos pendientes en segundo plano. Respeta el orden de vencimiento, el límite configurado y un intervalo mínimo de 15 segundos entre ejecuciones rápidas. El ciclo horario atiende el resto y las llamadas conservan su horario programado.

## Activar mantenimiento programado

1. Configura el origen público, D1 y `MAINTENANCE_TOKEN`. Completa las verificaciones de canales con el envío pausado.
2. Programa un `POST` por hora a `/api/maintenance/editorial` para OpenSEO, publicaciones programadas, captación y limpieza de registros. Programa un `POST` por hora a `/api/maintenance/nuevos` para el seguimiento y las conversaciones. Usa HTTPS y envía `X-UCG-Mantenimiento` con su secreto. Si Sites exige autorización de servicio, añade `OAI-Sites-Authorization: Bearer <credencial-de-Sites>`.
3. Para `/nuevos`, configura `OUTREACH_START_AT` en ISO 8601 con zona horaria, por ejemplo `2026-12-01T14:00:00Z`. La fecha se aplica a la creación del trabajo o de la señal. Los trabajos previos permanecen en el historial. Habilita `OUTREACH_ENABLED=true` tras verificar el permiso, el canal y la etapa elegible. WhatsApp requiere su habilitación adicional.
4. Consulta con `GET` las mismas rutas y cabeceras para revisar los estados y los recuentos agregados. `GET /api/maintenance` conserva el historial general. `POST /api/maintenance` devuelve `410`; actualiza cualquier tarea que todavía lo invoque. [Ventanas, estados y procedimiento de actualización](docs/actualizacion.md)

## Fuentes de búsqueda y publicaciones

El plan parte de las fichas institucionales de las 34 maestrías. Para cada programa elige la señal de búsqueda más pertinente según su fuente y su fuerza, y considera el interés registrado en el CRM y las guías ya publicadas. Las impresiones y los clics de Search Console describen la propiedad y el período medidos. Semrush y el generador público de OpenSEO aportan estimaciones separadas. Las posiciones se muestran por dispositivo y con tendencia cuando hay varias observaciones comparables.

El 22 de noviembre de 2026 se registró en el generador público de OpenSEO una muestra de 17 consultas para Ecuador. Incluye Inteligencia Artificial y Analítica de Datos, Educación Inclusiva, Administración de Empresas y consultas generales. El volumen corresponde a cada consulta exacta. La cobertura parcial, los valores sin dato y la fecha de obtención se conservan en el tablero. La sincronización autenticada de OpenSEO usa lecturas de datos existentes con un presupuesto de 0 créditos. [Generador público de OpenSEO](https://openseo.so/keyword-generator) · [Documentación del conector](https://openseo.so/docs/mcp)

El equipo edita, programa, pausa y publica en **Plan editorial**. Los borradores privados quedan en el espacio del equipo. La guía publicada se consulta en `/guias/{slug}` y la réplica institucional solo se acredita tras recibir un comprobante para la versión exacta. El plan público, los indicadores de lectura del portal y los resultados del CMS describen pasos distintos del proceso. [Publicación y conciliación editorial](docs/publicacion-editorial.md)

## Validación local

Con Node compatible con el proyecto y dependencias instaladas:

```sh
npm ci
npm test
npm run lint
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_plataforma_admisiones.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_admisiones_omnicanal.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_conversaciones_admisiones.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_contenido_openseo.sql
npm run dev
```

Las pruebas usan datos ficticios y respuestas simuladas; no demuestran configuración real, entregabilidad, disponibilidad externa ni seguridad del proxy. Consultar [verificación v2](docs/verificacion-v2.md), [diseño operativo](docs/diseno-operativo.md) y [respuestas de admisiones](docs/respuestas-admisiones.md).

## Portal, CRM y motor de contenidos

[Vista de la plataforma](https://casa-grande-posgrados.francisco.chatgpt.site/plataforma) · [Portal de aspirantes](https://casa-grande-posgrados.francisco.chatgpt.site/) · [CRM de demostración](https://casa-grande-posgrados.francisco.chatgpt.site/crm) · [Motor de contenidos](https://casa-grande-posgrados.francisco.chatgpt.site/motor-de-contenidos).

El portal opera en modo piloto. En `/crm` se puede probar la extracción de un correo o de una llamada con un ejemplo ficticio. En el motor de contenidos se puede consultar el plan y las guías públicas, y preparar una muestra aislada. Las acciones de demostración quedan en la sesión y el trabajo operativo se realiza en `/equipo`.

## Del primer contacto al seguimiento

1. Resend notifica la recepción de un correo en el buzón de posgrados o en una dirección de respuesta asociada a un caso. Retell envía el análisis de la llamada y Twilio remite la respuesta hablada al menú de admisiones. Los canales verifican sus firmas y la cuenta o el destinatario antes de aceptar datos.
2. La bandeja identifica la maestría, la intención, los obstáculos y el horizonte expresado. Conserva extractos breves como evidencia. Las identidades ambiguas o sin verificar pasan a revisión. Un contacto telefónico puede tener expediente sin dirección electrónica.
3. El agente registra la próxima acción y su fundamento. Una nueva solicitud web con correo autorizado recibe una bienvenida en español para confirmar el programa y el horizonte. La página de confirmación aplica cambios solo al enviarse el formulario. Una consulta directa inicial por correo puede recibir una respuesta limitada a esa petición cuando la identidad y el contenido satisfacen los criterios de verificación. El permiso de seguimiento comercial se gestiona por separado.
4. Las respuestas y bajas cambian la acción posterior. La bandeja conserva la decisión, el estado del envío y la próxima tarea. El despachador concurre con seguridad, limita la frecuencia y distingue una aceptación del proveedor de una entrega confirmada. El equipo conserva las decisiones académicas y revisa casos dudosos.

En el piloto la dirección de contacto es `posgrados-ucg@mail.coninteligensia.com`. Para migrar el remitente, verificar en Resend el dominio aprobado y actualizar los secretos del servidor antes de volver a publicar. La comprobación protegida `POST /api/maintenance/correo/prueba` envía una sola sonda al alias técnico del propio buzón. `GET` y `/equipo/conexiones` muestran el resultado de la última prueba. Si hay una incidencia, se registra la fase, el estado HTTP recibido y un código de error conocido. Un `502` de la ruta de la aplicación indica que la aceptación quedó sin confirmar. Consulta el diagnóstico y concilia el intento en Resend antes de repetirlo.

Para el canal de voz entrante configura `RETELL_INBOUND_NUMBER`, `RETELL_INBOUND_AGENT_ID` y el secreto de firma de Retell, o `TWILIO_INBOUND_NUMBER` junto con las credenciales de la cuenta Twilio. Los puntos de recepción y la última conversación registrada por canal están en el panel privado. Ninguna clave de servicio se guarda en Git.
