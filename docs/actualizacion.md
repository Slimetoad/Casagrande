# Mantenimiento programado y seguimiento

El mantenimiento necesita un programador externo autorizado. Crear una tarea **cada hora** que llame por HTTPS con `POST /api/maintenance` en el origen publicado. El servicio exige `X-UCG-Mantenimiento` con el valor de `MAINTENANCE_TOKEN`. Si el alojamiento Sites exige autorización adicional, enviar también `OAI-Sites-Authorization: Bearer <credencial-de-Sites>` con la credencial vigente de ese servicio. Guardar ambas credenciales como secretos; no asumir que son iguales ni escribirlas en el código o en los registros.

1. Aplicar las migraciones D1 numeradas en orden y configurar el origen, los proveedores y sus webhooks. Mantener `OUTREACH_ENABLED=false` durante la puesta a punto.
2. Crear la tarea horaria y comprobar los tres resultados devueltos. Hacer `GET /api/maintenance` con las mismas credenciales para consultar ejecuciones guardadas.
3. Interpretar `sin_configurar`, `en_pausa`, `completado`, `ya_procesado` o `error` en cada proceso. Ante un error, revisar la causa antes de volver a invocar; una ejecución fallida puede recuperarse. Un trabajo de envío con resultado incierto debe conciliarse con el proveedor antes de repetirse.
4. Probar con destinatarios internos autorizados, verificar permisos, bajas y recepción de webhooks. Solo después activar `OUTREACH_ENABLED=true`; WhatsApp necesita además `OUTREACH_WHATSAPP_ENABLED=true` y plantillas aprobadas. El equipo editorial aprueba las guías antes de publicarlas.

Cuando entra un expediente nuevo con una bienvenida autorizada y el correo o WhatsApp están habilitados, el servidor procesa hasta tres trabajos pendientes en segundo plano. Respeta el orden de vencimiento, el límite configurado y un intervalo mínimo de 15 segundos entre ejecuciones rápidas. El ciclo horario atiende el resto y las llamadas conservan su horario programado.

| Proceso | Ventana UTC | Función |
| --- | --- | --- |
| `seguimiento` | Hora | Procesa trabajos elegibles con autorización, canal y etapa vigentes, sujetos a configuración y horario de voz. |
| `captacion` | Día | Actualiza mediciones de campañas activas; no publica anuncios ni compra medios. |
| `contenido` | Semana a partir del lunes UTC | Sincroniza fuentes disponibles y, si `SEO_AUTODRAFT=true` y hay modelo activo, puede crear un borrador para revisión. |

Las llamadas repetidas dentro de la misma ventana reutilizan el registro del proceso. Un proceso detenido en curso puede recuperarse tras el plazo previsto por la aplicación. Los estados `en_pausa` y `sin_configurar` se registran en esa ventana: tras cambiar la configuración, esperar la siguiente ventana aplicable. La activación o pausa de un canal no altera los demás permisos. `OUTREACH_ENABLED=false` pausa los envíos y `SEO_AUTODRAFT=false` detiene la redacción automática; se conservan expedientes e historial. Los webhooks necesitan acceso HTTPS externo y secretos válidos.

La versión de conversaciones incorpora el ciclo horario `conversaciones`. Revisa la cola de actuaciones originadas en correo o voz y procesa las elegibles. Además, la recepción confirmada puede activar una pasada pequeña en segundo plano. Un rebote, una baja, un envío incierto o un caso cerrado modifican la elegibilidad. El portal distingue la entrega por el proveedor del acto de responder del aspirante.

En el alojamiento publicado, el programador vinculado recupera en memoria la credencial de servicio de este mismo sitio y la envía tanto en la cabecera de acceso de Sites como en la de mantenimiento configurada para este piloto. Nunca se registra su valor. Verificar estado HTTP y los procesos devueltos, y leer el historial con GET. Los operadores pueden confirmar el circuito de correo con la prueba técnica descrita en el README y ver las conversaciones en la bandeja privada.
