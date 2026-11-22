# Plan y publicación editorial de Posgrados

El ciclo editorial ordena una propuesta por cada uno de los 34 programas. La mitad de la prioridad corresponde a la demanda de búsqueda disponible, una cuarta parte a consultas y avances recientes del CRM y una cuarta parte a la cobertura de guías. La puntuación usa la señal más fuerte atribuida al programa. OpenSEO aporta estimaciones de búsquedas en Ecuador y Search Console aporta observaciones de la propiedad conectada. Sus cifras conservan la fuente y el período.

El calendario reserva hasta tres publicaciones semanales con horario de Guayaquil. El primer ciclo habilitado puede publicar una guía inicial. Los ciclos siguientes comprueban su fecha de calendario y la separación mínima. `SEO_EDITORIAL_AUTOPUBLISH=true` permite publicar automáticamente las guías del catálogo con fuente válida. El equipo puede pausar el ciclo, reprogramar propuestas o guardar una edición privada para publicarla expresamente. Una edición privada se conserva aparte de la versión que leen los aspirantes.

Cada guía usa la ficha oficial y material editorial específico para su programa. El borrador excluye afirmaciones inferidas sobre becas, cupos, matrículas, aranceles y fechas de convocatorias. Claude Haiku 5.5 ordena los bloques documentados y puede redactar hasta dos preguntas prácticas vinculadas al temario. El sistema valida su formato, evita introducir condiciones de admisión y conserva la procedencia del texto que se publica. El motor valida la selección, registra la procedencia y conserva el borrador para reutilizarlo. `SEO_EDITORIAL_LIVE_SOURCE_CHECK=true` pide una comprobación de accesibilidad directa de la ficha antes de publicar.

Tras la primera guía de un programa, una nueva consulta de la cuenta conectada de OpenSEO o de Search Console puede activar otra propuesta sobre un tema distinto. El motor comprueba la fecha de observación, evita repetir temas y mantiene el límite semanal. Las observaciones públicas iniciales permiten ordenar las primeras 34 propuestas.

## Integración con el CMS institucional

El portal guarda primero la guía publicada. Habilita la réplica institucional con una ruta HTTPS de `casagrande.edu.ec` o de uno de sus subdominios en `SEO_INSTITUTIONAL_CMS_URL` y guarda su token Bearer en el secreto `SEO_INSTITUTIONAL_CMS_TOKEN`. El endpoint debe aplicar una sola escritura por clave y versión, devolver el mismo comprobante en reintentos y rechazar versiones anteriores a la vigente. El publicador valida el destino antes de transmitir la guía y los redireccionamientos requieren corregir la configuración.

La solicitud es un `POST` con `Authorization: Bearer …`, `Content-Type: application/json` e `Idempotency-Key`. El cuerpo lleva el tipo `ucg.postgrados.guide.publish.v1`, la misma `idempotencyKey`, el entero `version` y un objeto `article` con identificador, slug, programa, título, resumen, cuerpo, fuente oficial, URL del portal y fechas de publicación y actualización.

El CMS confirma publicación con HTTP 2xx y un JSON que contiene `status: "published"`, `idempotencyKey`, `version`, `receiptId` y una `url` pública HTTPS del dominio institucional. La clave y la versión deben coincidir exactamente con la solicitud. Solo entonces se cuenta la publicación institucional y se muestra su enlace público.

Una respuesta 429 o `Idempotency-Status: not-applied` habilita reintentos acotados con la misma clave y versión. Una conexión interrumpida, un recibo inválido o una respuesta ambigua quedan por conciliar. El equipo comprueba el resultado en el CMS antes de usar la acción `retryCms` para la misma versión. La pausa detiene nuevas solicitudes y conserva las guías que ya están en el portal.
