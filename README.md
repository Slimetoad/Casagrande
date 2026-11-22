# Posgrados · Universidad Casa Grande

Portal público para explorar programas, recibir orientación, solicitar información y gestionar una cita; incluye una consola privada de admisiones. El catálogo contiene fichas tomadas de fuentes UCG, no una garantía de convocatoria abierta. La universidad debe confirmar nombres, mallas, precios, fechas y disponibilidad de cada cohorte.

## Recorridos y equipo

| Ruta | Uso |
| --- | --- |
| `/`, `/programas`, `/programas/{slug}` | Inicio, catálogo y fichas con fuentes oficiales |
| `/orientacion`, `/financiamiento`, `/solicitar` | Orientación, simulación de presupuesto y consulta |
| `/cita` | Reservar una franja publicada o solicitar una propuesta de horario |
| `/guias` | Guías aprobadas por el equipo |
| `/equipo`, `/equipo/manual` | Consola y manual del personal autorizado |
| `/equipo?demo=1` | Demostración con datos ficticios |
| `/equipo/verificacion` | Verificación operativa para el equipo |

Una cita reservada ocupa una franja de la agenda local; solicitar una propuesta no confirma horario. El enlace privado permite consultar o cancelar la solicitud. La agenda no comprueba calendarios externos en vivo. En el expediente se asignan responsable y tareas, se registran bloqueos y se avanza por etapas. Admitido y Matriculado requieren referencias institucionales; la matrícula verificada no se infiere de una consulta ni de una cita.

El tablero de fichas muestra actividad de los últimos 30 días y un experimento de dos textos de consulta. Sus exposiciones y clics son eventos agregados; las solicitudes atribuidas dependen de la información conservada por el navegador. Las columnas pueden incluir cohortes diferentes y no prueban causalidad. Las campañas de captación se proponen, revisan y activan por personal; no compran publicidad ni publican anuncios automáticamente.

## Configuración

Guardar credenciales como secretos del servidor; no incluirlas en código ni registros. La plataforma se publica en modo piloto. `INSTITUTIONAL_LIVE=true` permite retirar el aviso de piloto tras la adopción formal por la universidad. Configurar D1 y aplicar las migraciones numeradas en orden, sin reescribir `0000`. Verificar respaldo y procedimiento de actualización antes de aplicarlas a datos existentes.

| Función | Valores y comprobaciones |
| --- | --- |
| Acceso del equipo | `ADMISSIONS_STAFF_EMAILS` lista correos autorizados; `ADMISSIONS_STAFF_TOKEN` es opcional para clientes internos. La identidad debe venir de un proxy confiable que quite cabeceras de identidad suministradas por visitantes y bloquee accesos que lo eludan. En otro alojamiento integrar SSO institucional. |
| Origen y SEO | `PUBLIC_BASE_URL` es el origen HTTPS canónico. `SEO_INDEXABLE=true` habilita indexación en ese origen. Confirmar contenido y dominio antes de activarla. |
| Modelos opcionales | `LLM_PROVIDER` puede ser `openai`, `anthropic` o `google`; configurar respectivamente `OPENAI_API_KEY` y `OPENAI_MODEL`, `ANTHROPIC_API_KEY` y `ANTHROPIC_MODEL`, o `GEMINI_API_KEY` y `GEMINI_MODEL`. Sin modelo quedan disponibles las respuestas basadas en catálogo. |
| Correo | `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET` y, para respuestas, `RESEND_REPLY_DOMAIN` y credenciales de recepción. Ver [recepción de respuestas](docs/respuestas-admisiones.md). |
| Voz | `OUTREACH_VOICE_PROVIDER=twilio` usa `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`; `retell` usa `RETELL_API_KEY`, `RETELL_FROM` en E.164, `RETELL_AGENT_ID` y opcionalmente `RETELL_AGENT_VERSION` y `RETELL_WEBHOOK_KEY`. Configurar el agente publicado y el webhook de Retell en español. Solo se selecciona un proveedor de voz. |
| WhatsApp | `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_GRAPH_VERSION` y al menos una plantilla aprobada: `WHATSAPP_TEMPLATE_WELCOME`, `WHATSAPP_TEMPLATE_GUIDANCE`, `WHATSAPP_TEMPLATE_APPLICATION` o `WHATSAPP_TEMPLATE_ADMISSION`. `WHATSAPP_TEMPLATE_LANGUAGE` por defecto es `es`. Registrar el webhook HTTPS `/api/webhooks/whatsapp`. |
| Seguimiento | `OUTREACH_ENABLED=true` habilita la cola de canales configurados; WhatsApp requiere también `OUTREACH_WHATSAPP_ENABLED=true`. `OUTREACH_BATCH_SIZE` limita la pasada. Los permisos son independientes por canal y la etapa debe permitir el mensaje. |
| Búsqueda y contenido | `GSC_SITE` con `GSC_ACCESS_TOKEN` o `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`; opcionalmente `SEMRUSH_API_KEY`, `SEMRUSH_DOMAIN`, `SEMRUSH_DATABASE`. `SEO_AUTODRAFT=true` permite generar borradores; un editor decide su publicación. |
| Programador | `MAINTENANCE_TOKEN` protege `/api/maintenance`. Activar un programador externo horario como se describe abajo y en [actualización](docs/actualizacion.md). |

Configurar en los proveedores los webhooks HTTPS correspondientes: `/api/webhooks/resend`, `/api/webhooks/twilio/status/{id}` y `/api/webhooks/twilio/menu/{id}` generados para cada llamada, `/api/webhooks/retell` y `/api/webhooks/whatsapp`. Aprobar remitentes, plantillas y textos, comprobar firmas y bajas y hacer pruebas controladas con destinatarios internos autorizados antes de habilitar envíos. Una aceptación del proveedor no equivale a entrega ni a conversación. Una petición de resultado incierto requiere conciliación antes de repetirla.

Para llamar a Ecuador con Retell, `RETELL_FROM` debe ser un número importado con un proveedor de telefonía SIP que permita la salida a `+593`. Los números comprados a Retell para la API de llamadas tienen destinos limitados a Estados Unidos. Antes de seleccionar Retell y habilitar el seguimiento, comprobar la conexión SIP y probar la ruta con un número interno ecuatoriano autorizado. [API de llamadas de Retell](https://docs.retellai.com/api-references/create-phone-call) · [Conectar telefonía SIP](https://docs.retellai.com/deploy/custom-telephony).

Cuando entra un expediente nuevo con una bienvenida autorizada y el correo o WhatsApp están habilitados, el servidor procesa hasta tres trabajos pendientes en segundo plano. Respeta el orden de vencimiento, el límite configurado y un intervalo mínimo de 15 segundos entre ejecuciones rápidas. El ciclo horario atiende el resto y las llamadas conservan su horario programado.

## Activar mantenimiento programado

1. Configurar el origen público, D1, `MAINTENANCE_TOKEN` y los canales que se desean usar; mantener los envíos pausados hasta completar la verificación.
2. Crear en el programador autorizado del despliegue una tarea **cada hora** que haga `POST` a `https://<origen>/api/maintenance` y envíe el secreto `MAINTENANCE_TOKEN` en `X-UCG-Mantenimiento`. Si Sites exige además autorización de servicio, adjuntar `OAI-Sites-Authorization: Bearer <credencial-de-Sites>` usando la credencial vigente del servicio. Ambos secretos se guardan en el programador; pueden ser distintos.
3. Consultar con `GET` y las mismas cabeceras el historial. La ejecución horaria atiende seguimiento, una vez al día mide captación y una vez por semana ejecuta contenido; los períodos se calculan en UTC. La tarea no se crea por sí sola al desplegar el código.
4. Tras verificar con datos autorizados, activar `OUTREACH_ENABLED=true` y, si corresponde, `OUTREACH_WHATSAPP_ENABLED=true`. Las configuraciones `false` detienen despachos; `SEO_AUTODRAFT=false` detiene la generación automática de borradores.

## Validación local

Con Node compatible con el proyecto y dependencias instaladas:

```sh
npm ci
npm test
npm run lint
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_plataforma_admisiones.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_admisiones_omnicanal.sql
npm run dev
```

Las pruebas usan datos ficticios y respuestas simuladas; no demuestran configuración real, entregabilidad, disponibilidad externa ni seguridad del proxy. Consultar [verificación v2](docs/verificacion-v2.md), [diseño operativo](docs/diseno-operativo.md) y [respuestas de admisiones](docs/respuestas-admisiones.md).

## Portal, CRM y motor de contenidos

[Vista de la plataforma](https://casa-grande-posgrados.francisco.chatgpt.site/plataforma) · [Portal de aspirantes](https://casa-grande-posgrados.francisco.chatgpt.site/) · [CRM de muestra](https://casa-grande-posgrados.francisco.chatgpt.site/crm) · [Motor de contenidos de muestra](https://casa-grande-posgrados.francisco.chatgpt.site/motor-de-contenidos). Las demostraciones usan ejemplos aislados. El equipo autorizado opera los expedientes y contenidos reales en `/equipo` y revisa sus canales en `/equipo/conexiones`.

## Del primer contacto al seguimiento

1. Resend notifica la recepción de un correo en el buzón de posgrados o en una dirección de respuesta asociada a un caso. Retell envía el análisis de la llamada y Twilio remite la respuesta hablada al menú de admisiones. Los canales verifican sus firmas y la cuenta o el destinatario antes de aceptar datos.
2. La bandeja identifica la maestría, la intención, los obstáculos y el horizonte expresado. Conserva extractos breves como evidencia. Las identidades ambiguas o sin verificar pasan a revisión. Un contacto telefónico puede tener expediente sin dirección electrónica.
3. El agente registra la próxima acción y su fundamento. Una nueva solicitud web con correo autorizado recibe una bienvenida en español para confirmar el programa y el horizonte. La página de confirmación aplica cambios solo al enviarse el formulario. Una consulta directa inicial por correo puede recibir una respuesta limitada a esa petición cuando la identidad y el contenido satisfacen los criterios de verificación. El permiso de seguimiento comercial se gestiona por separado.
4. Las respuestas y bajas cambian la acción posterior. La bandeja conserva la decisión, el estado del envío y la próxima tarea. El despachador concurre con seguridad, limita la frecuencia y distingue una aceptación del proveedor de una entrega confirmada. El equipo conserva las decisiones académicas y revisa casos dudosos.

En el piloto la dirección de contacto es `posgrados-ucg@mail.coninteligensia.com`. Para migrar el remitente, verificar en Resend el dominio aprobado y actualizar los secretos del servidor antes de volver a publicar. La comprobación protegida `POST /api/maintenance/correo/prueba` envía una sola sonda al alias técnico del propio buzón y `GET` muestra si su contenido pudo leerse tras el webhook. La sonda no crea aspirantes.

Para el canal de voz entrante configura `RETELL_INBOUND_NUMBER`, `RETELL_INBOUND_AGENT_ID` y el secreto de firma de Retell, o `TWILIO_INBOUND_NUMBER` junto con las credenciales de la cuenta Twilio. Los puntos de recepción y la última conversación registrada por canal están en el panel privado. Ninguna clave de servicio se guarda en Git.
