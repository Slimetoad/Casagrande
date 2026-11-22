# Admisiones de posgrado · Universidad Casa Grande

## De una búsqueda a una matrícula confirmada

Una profesional que busca una maestría compatible con su trabajo debería poder resolver tres preguntas antes de entregar sus datos. ¿Qué programa encaja con lo que quiere hacer? ¿Puede organizar su tiempo y presupuesto? ¿Con quién puede verificar lo que falta? La universidad plantea un aprendizaje por proyectos y problemas reales. Las fichas y la orientación deben mostrar cómo se traduce esa propuesta en el programa que la persona está considerando. [Posgrados UCG](https://www.casagrande.edu.ec/posgrados)

El resultado comercial que interesa es la matrícula confirmada en una cohorte. El formulario inicia una conversación. El orientador puede recomendar un programa y el equipo comercial puede acompañar la postulación. La confirmación final requiere evidencia de la universidad.

| Momento | Qué resuelve el aspirante | Qué necesita saber el asesor |
| --- | --- | --- |
| Descubrimiento | Llega desde una búsqueda a una ficha, explora áreas o lee una guía relacionada con su objetivo. | La página y la campaña de entrada cuando se puedan atribuir. |
| Orientación | Responde el cuestionario y abre una ficha para contrastar la recomendación con la oferta oficial. | El programa de interés y, si se comparte al solicitar contacto, el contexto de la orientación. |
| Presupuesto | Explora cuotas a partir de supuestos explícitos y puede solicitar una cotización. | Que hay una consulta económica pendiente. Una cuota simulada requiere confirmación antes de citarla como oferta. |
| Solicitud | Deja sus datos, indica qué canal de seguimiento acepta y recibe confirmación de la solicitud. | Qué pidió, por qué canal se le puede contactar y a quién corresponde el próximo paso. |
| Postulación y matrícula | Recibe una respuesta concreta y acuerda el siguiente paso con admisiones. | Un responsable verifica en el registro académico la evidencia de matrícula antes de cerrar el caso. |

## Cómo se conecta la plataforma

| Componente | Intercambio de información | Dependencia operativa |
| --- | --- | --- |
| Portal de posgrados | El servidor entrega páginas en español para las fichas, la orientación, las guías y el formulario. El simulador muestra los supuestos utilizados para el cálculo. | Validación periódica del catálogo por la universidad. |
| Captación y CRM | La solicitud genera un expediente deduplicado por correo. Cada envío conserva el interés, la fuente, las elecciones de contacto y la versión del texto de consentimiento. El historial organiza cambios, tareas y seguimientos. | Base de datos D1 y acceso autorizado para el equipo de admisiones. |
| Orientador y redacción | El servidor solicita al proveedor de IA seleccionado que responda a partir del catálogo y la evidencia disponible. Los casos que requieren una decisión académica pasan al equipo. | Credencial privada de OpenAI, Anthropic o Google para la generación con modelos. |
| Cola de seguimiento | Los trabajos de correo y voz se vinculan al expediente. El servicio tramita los pendientes y registra los fallos para el equipo. Twilio usa un menú interactivo; Retell necesita un agente publicado y configurado en español. | Resend para correo, Twilio o Retell para voz y WhatsApp Cloud API para mensajería. La universidad configura cuentas, remitentes, plantillas, webhooks y política de contacto antes de activar envíos. |
| Captación orgánica | Search Console aporta señales de búsqueda de la propiedad universitaria. Semrush puede complementar el análisis cuando se dispone de acceso. Las oportunidades vinculan consulta, programa y contenido propuesto. | Propiedad autorizada o suscripción API y revisión editorial previa a la publicación. [Referencia de Search Console](https://developers.google.com/webmaster-tools/v1/api_reference_index?hl=es-419) |

Una profesional que solicita orientación por correo después de usar el simulador ilustra el flujo. El asesor abre la consulta, revisa el programa y confirma el arancel de la convocatoria. Si la profesional aún está comparando alternativas, el siguiente paso puede ser una conversación sobre horarios. Si más tarde presenta su solicitud, el equipo actualiza la etapa. Cada paso se apoya en una acción observada o acordada.

## Cómo trabajar la cartera

Al abrir la jornada, el asesor revisa los seguimientos vencidos y las nuevas solicitudes. Al abrir una ficha debería poder responder de inmediato qué programa interesó, qué pasó desde el último contacto y qué debe resolver hoy. Al terminar una conversación, registra el resultado y deja una tarea con responsable y fecha. Si la persona pide tiempo, acuerda cuándo retomar y pausa el seguimiento automático.

**Primera tarea.** El sistema propone revisar en cuatro horas las consultas identificadas como financiamiento o postulación, en doce horas las de orientación y en veinticuatro horas las consultas generales. Son vencimientos internos para ordenar la jornada. El asesor puede acordar otro plazo con el aspirante. Una nueva consulta que coincide con un correo existente queda en el expediente para revisión y conserva las preferencias vigentes.

**Preparar orientación.** Desde una ficha, el asesor puede solicitar un resumen de la etapa, los programas considerados, las herramientas utilizadas y las tareas pendientes. El copiloto propone un siguiente paso y preguntas para la conversación. Cuando el correo está autorizado y el seguimiento está activo, ofrece un borrador para revisión. El modelo opcional prioriza temas a partir de categorías predefinidas y hechos del catálogo. Los nombres, direcciones, notas, parámetros de campaña y montos personales quedan fuera de esa consulta. Preparar el resumen conserva la etapa del expediente y deja el envío en manos del equipo.

| Etapa del CRM | Cuándo asignarla |
| --- | --- |
| Nuevo | La universidad recibió una consulta válida. |
| En orientación | Un asesor inició el acompañamiento y documentó la necesidad del aspirante. |
| En postulación | El aspirante inició la postulación y el equipo registró el siguiente hito. |
| Admitido | La autoridad académica comunicó la decisión y un responsable la verificó. |
| Matriculado | El registro universitario confirma la matrícula para la cohorte. |
| Cerrado | Terminó el seguimiento. Conviene documentar el motivo y los acuerdos de contacto. |

| Situación | Acción del agente | Responsabilidad del equipo |
| --- | --- | --- |
| El aspirante aún está explorando | Orientar con hechos del catálogo y ofrecer la ficha y la fuente oficial. | Resolver dudas que exijan criterio académico o información ausente. |
| Hay una solicitud con permiso de correo | Preparar el seguimiento asociado al programa y registrar el intento y su resultado. | Atender la respuesta desde el buzón institucional y actualizar el expediente. |
| El aspirante pidió una llamada | Usar el canal habilitado bajo las condiciones aprobadas por la UCG. | Identificar la universidad, explicar el motivo de la llamada y ofrecer atención personal. |
| Se consulta un precio, beca, equivalencia, cupo o fecha sin respaldo | Indicar que necesita confirmación y proponer contacto con admisiones. | Consultar la fuente vigente y entregar una respuesta con fecha y responsable. |
| Se retira un permiso, se registra una matrícula o se cierra el caso | Detener las acciones promocionales correspondientes. | Revisar el historial y tramitar las solicitudes sobre datos personales por el canal institucional. |

Los criterios de prioridad deben poder explicarse al asesor con hechos observables, como el paso solicitado o un compromiso vencido. La capacidad de pago simulada, la edad, el origen y otras características personales se excluyen de las decisiones de acceso. El agente tampoco concede becas, determina admisiones ni confirma pagos.

## Un motor editorial que aprende de la búsqueda

1. Conectar la propiedad verificada de la universidad. Guardar la procedencia, el período y las dimensiones disponibles de cada dato. Una extracción sin datos debe quedar identificada para que el equipo pueda distinguirla de una caída de tráfico.
2. Buscar consultas que ya generan impresiones y que una ficha oficial puede resolver. En la revisión editorial, comprobar página de destino, intención y contenido existente para evitar páginas duplicadas. Una búsqueda sobre modalidad puede justificar mejorar la ficha en lugar de crear otra guía.
3. Preparar un borrador en español con una respuesta directa, referencias académicas verificables y una llamada a la acción coherente con la consulta. Con la redacción automática habilitada, el ciclo programado selecciona la oportunidad prioritaria pendiente y prepara una guía para revisión. El editor también puede elegir una oportunidad desde la consola.
4. La persona responsable de contenidos verifica el programa, la vigencia y el enlace de destino. Aprueba la publicación, pide cambios o retira la propuesta. Conviene asignar a cada guía una fecha de revisión, especialmente si cambia una convocatoria.
5. Revisar clics orgánicos, solicitudes y matrículas atribuibles por página. Un aumento en impresiones acompañado de más consultas irrelevantes justifica revisar el enfoque antes de extenderlo a otras maestrías.

## Qué medir en el piloto

El tablero operativo usa los registros del CRM y contadores diarios de interacción. Los contadores resumen los últimos treinta días por tipo de evento y origen y respetan las señales de privacidad del navegador. Si una persona vuelve al portal, puede volver a contarse. Para la evaluación del piloto, la universidad debe definir cohortes y conciliar las matrículas con el registro académico. La ventana de observación debe ser igual entre grupos y permitir que el ciclo de postulación termine.

| Pregunta | Indicador propuesto | Definición |
| --- | --- | --- |
| ¿Los visitantes encuentran un siguiente paso útil? | Conversión a solicitud | Solicitudes válidas y deduplicadas divididas entre visitas elegibles a la experiencia, por programa y página de entrada. Publicar la cobertura de atribución. |
| ¿Llega a tiempo la primera ayuda? | Tiempo de primera respuesta humana | Mediana y percentil 90 desde la solicitud hasta la primera respuesta humana registrada. Reportar por separado los casos pendientes y los acuses automáticos. |
| ¿La orientación genera matrículas? | Matrícula por aspirante | Personas con matrícula verificada en la cohorte divididas entre aspirantes únicos asignados al piloto. Contar una persona una vez por cohorte. |
| ¿La captación es eficiente? | Costo por matrícula incremental | Diferencia de costos entre grupos, incluyendo medios, llamadas y tiempo asesor, dividida entre matrículas adicionales estimadas. Si el efecto no es distinguible de cero, reportar la incertidumbre. |
| ¿El seguimiento respeta al aspirante? | Bajas, quejas y carga de contacto | Bajas y quejas por canal y por destinatario contactado, intentos duplicados, llamadas sin respuesta y respuestas pendientes. |

**Experimentos propuestos.** Comenzar por el cuello de botella observado. Si las fichas reciben visitas y pocas solicitudes, comparar una llamada genérica con «Consultar sobre esta maestría», manteniendo idénticos los permisos y el formulario. Si hay solicitudes pero pocas conversaciones, comparar el seguimiento habitual con una primera respuesta que retome la pregunta concreta del aspirante. En ambos casos, el asesor debe seguir atendiendo todo contacto solicitado.

Asignar a cada participante a una sola variante antes de la intervención, mantener su asignación en las visitas siguientes cuando exista base para hacerlo y analizar según el grupo original. Fijar de antemano el indicador principal, la diferencia mínima relevante, el tamaño de muestra, la ventana de lectura y el criterio para detener el experimento ante problemas de contacto. Si el volumen es insuficiente por maestría, agrupar cohortes comparables y reportar los resultados como exploratorios. La tasa de conversión de Casa Grande se conocerá después de medirla.

## Puesta en marcha

| Responsable | Antes de abrir la experiencia a aspirantes reales |
| --- | --- |
| Dirección de posgrados | Aprobar programas, descripciones, uso de imágenes, responsables académicos y fuentes autorizadas para precios, horarios, requisitos y convocatorias. |
| Admisiones | Nombrar responsables de cartera y del buzón de respuestas, acordar horarios de llamada, tiempos de atención y la evidencia admisible para confirmar matrícula. |
| Tecnología | Configurar el acceso del personal, secretos, propiedad SEO y dominio de correo verificado. Probar reintentos sin contactos duplicados, cancelación de trabajos, bajas, fallos de proveedor y restauración de los datos. |
| Protección de datos | Validar finalidad y texto por canal, conservación, solicitudes de derechos y contratos con proveedores. Comprobar con una solicitud de prueba que se puede demostrar la autorización y que retirarla detiene el contacto. |
| Crecimiento | Definir la línea base y el período de cohorte. Probar parámetros de campaña, páginas indexables en el dominio autorizado y conciliación de resultados con la matrícula oficial. |

**Ejecución periódica.** La rutina de mantenimiento ejecuta seguimiento por hora, captación por día y contenido por semana, con períodos UTC. Tecnología debe conectar un programador autorizado y comprobar el historial de ejecuciones. El equipo puede probar los procesos desde la consola. Para el envío real se requieren credenciales de los proveedores, remitentes autorizados y la activación explícita de los envíos.

Primero, realizar un ensayo con destinatarios internos autorizados. Después, iniciar una cohorte con responsables disponibles para revisar cada incidencia. Ampliar a otras maestrías cuando la universidad haya verificado los datos académicos, la continuidad del seguimiento y los resultados del ensayo.

La política institucional describe las finalidades de tratamiento y el canal para peticiones. En Ecuador, cuando el consentimiento es la base elegida, la autorización debe ser libre, específica, informada e inequívoca y se puede revocar. La propuesta recoge permisos de correo, voz y WhatsApp por separado; solicitar una cita solo autoriza su gestión. El equipo jurídico y el delegado de la UCG deben validar los textos y los procedimientos aplicables a su operación. [Política UCG](https://www.casagrande.edu.ec/politica-de-privacidad) · [LOPDP, art. 8](https://spdp.gob.ec/wp-content/uploads/2024/12/03.pdf.pdf) · [Orientación de la SPDP sobre el derecho de oposición](https://www.spdp.gob.ec/docs/proteccion-de-datos-personales/cuales-son-mis-derechos/derecho-de-oposicion/)


## Agenda, expediente y captación en la versión pública

El equipo publica franjas para una persona asesora y duración concreta. La plataforma rechaza solapamientos del mismo asesor y una franja solo admite una reserva activa. En [la página de citas](/cita), el aspirante puede elegir una franja disponible o pedir una propuesta de horario; en el segundo caso el equipo debe asignarla. La clave del enlace de gestión permite consultar y cancelar, por lo que debe tratarse como privada. La disponibilidad corresponde a esta agenda, sin conciliación automática con calendarios externos.

Cada consulta y cita queda asociada al expediente. El equipo registra responsable, tareas y bloqueos, y usa transiciones permitidas de etapa. Admitido requiere referencia de la decisión; Matriculado exige referencia de matrícula. Los retrocesos y cierres requieren motivo y el historial se conserva. Una solicitud de cita no confirma admisión, matrícula ni permiso de seguimiento por otros canales.

El panel de captación reúne señales de búsqueda, consultas y avances e identifica oportunidades y campañas para revisión humana. Una propuesta se puede revisar y activar en el sistema, que mide su código de campaña; no se publica ni compra pauta automáticamente. El experimento de fichas presenta dos textos de invitación, conserva la variante en la pestaña y agrega exposiciones y clics respetando las señales de privacidad. Las solicitudes atribuidas dependen de que se conserve la variante. Las métricas son exploratorias y no son una estimación causal ni un embudo de cohortes uniforme.

Los canales necesitan permisos separados. Correo, WhatsApp y voz admiten bajas y verificaciones del proveedor; tras una aceptación o un resultado incierto, el equipo debe conciliar el estado antes de repetir. La configuración de Retell y WhatsApp requiere verificar cuenta, origen HTTPS, agente o plantillas aprobadas, firmas, eventos de entrega, baja y atención humana con destinatarios internos autorizados. Consultar los nombres de variables y la activación del programador en el README del proyecto.

La [verificación independiente](/equipo/verificacion) describe los escenarios locales ejecutados, las fuentes académicas comprobadas y sus límites. Antes de abrir una cohorte, contrastar los datos de cada programa y verificar identidad del personal, migración D1, remitentes, calendario operativo y resultados de proveedores en el entorno real.

## Correo y llamadas en el expediente

La bandeja de conversaciones del CRM muestra el canal, la intención de la persona, los datos extraídos y la evidencia textual. Al abrir el expediente, el equipo puede ver la acción decidida por el agente y el resultado del intento de contacto. Una solicitud directa verificada puede generar una sola respuesta contextual. Los contactos que requieren resolver una ambigüedad de identidad o de contenido quedan para revisión del equipo.

Consulta [Conexiones de admisiones](/equipo/conexiones) para ver qué servicios están configurados. [La plataforma](/plataforma) permite abrir el sitio y las demostraciones públicas del CRM y del motor de contenidos sin exponer expedientes reales.
