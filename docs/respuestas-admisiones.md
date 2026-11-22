# Respuestas de los aspirantes

## Correo

El correo de admisiones puede llevar una dirección de respuesta distinta por ficha. El dominio de recepción debe estar bajo control de la universidad.

1. Habilita la recepción en Resend y configura los registros de correo del dominio. Define `RESEND_REPLY_DOMAIN` para las respuestas por alias y `RESEND_ADMISSIONS_INBOUND_ADDRESS` para el buzón que recibe consultas directas. La dirección del buzón debe coincidir con el destinatario principal del mensaje.
2. Configura `/api/webhooks/resend`, selecciona `email.received` y guarda el secreto de firma en `RESEND_WEBHOOK_SECRET`.
3. Define `RESEND_RECEIVING_API_KEY` con permiso para leer correos entrantes. Si falta esta clave, la aplicación utiliza `RESEND_API_KEY`. Comprueba que la clave permita usar la API de recepción.
4. Prueba el buzón directo y el alias desde cuentas internas autorizadas. Comprueba el extracto redactado, la vinculación del alias y la revisión de remitentes sin verificar en la bandeja del equipo.

El alias exige coincidencia con el correo del expediente. Una consulta directa autenticada puede crear un expediente sin dar permisos de contacto. Para asociar al remitente, la aplicación acepta DMARC aprobado o el resultado `gray` de DMARC con DKIM aprobado según Resend. Una identidad incierta queda en revisión con datos mínimos. Solo DMARC aprobado habilita la evaluación de una primera respuesta transaccional. Se conservan extractos redactados y se omiten los adjuntos, las respuestas automáticas y las copias dirigidas a otros buzones.

Para verificar la configuración, consulta la [documentación de recepción de Resend](https://resend.com/docs/webhooks/emails/received) y la [lectura de correo entrante](https://resend.com/docs/api-reference/emails/retrieve-received-email).

## Llamadas

- **Retell AI.** Configura `RETELL_INBOUND_NUMBER` en formato E.164, `RETELL_INBOUND_AGENT_ID` y, si se requiere una versión específica, `RETELL_INBOUND_AGENT_VERSION`. Configura el webhook firmado `/api/webhooks/retell` para `call_ended` y `call_analyzed`. La bandeja recoge las intervenciones del aspirante del análisis final y registra las bajas que detecta en la llamada. [Eventos de Retell](https://docs.retellai.com/features/webhook-overview).
- **Twilio.** Configura `TWILIO_INBOUND_NUMBER`, `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN`. En el número entrante, usa `POST /api/webhooks/twilio/inbound` para el saludo y `POST /api/webhooks/twilio/inbound/status` para el estado. El saludo indica que la atención es automatizada y envía la voz reconocida al callback firmado `/api/webhooks/twilio/inbound/speech`. Marcar nueve o pedir la baja registra la preferencia de voz. [Twilio Gather](https://www.twilio.com/docs/voice/twiml/gather) · [Validación de webhooks](https://www.twilio.com/docs/usage/security#validating-requests).

Usa el mismo origen HTTPS público de la aplicación al registrar los webhooks. La bandeja procesa texto de las intervenciones y conserva extractos redactados. Para llamar al aspirante después se requiere autorización por separado.
