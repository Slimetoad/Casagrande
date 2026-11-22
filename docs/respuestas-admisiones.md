# Respuestas de los aspirantes

El correo de admisiones puede llevar una dirección de respuesta distinta por ficha. El dominio de recepción debe estar bajo control de la universidad.

1. Habilita la recepción del dominio o subdominio en Resend y configura sus registros de correo. Define `RESEND_REPLY_DOMAIN` con el dominio, por ejemplo, `respuestas.ejemplo.edu.ec`.
2. En el webhook firmado de Resend, selecciona el evento `email.received` y configura el secreto de firma en la aplicación.
3. Define `RESEND_RECEIVING_API_KEY` con un permiso válido de lectura de correos entrantes. Si no existe, se utiliza `RESEND_API_KEY`. Un permiso limitado al envío permite registrar el asunto de la respuesta.
4. Envía una prueba controlada desde una cuenta propia, responde desde el mismo correo y comprueba en la ficha el extracto, la pausa del seguimiento y la tarea «Responder al correo del aspirante».

Cada alias contiene un identificador aleatorio. La aplicación comprueba el dominio, el alias y la coincidencia con el correo del aspirante antes de consultar el cuerpo en Resend. Guarda un extracto de hasta 560 caracteres sin adjuntos. Omite los remitentes desconocidos y las respuestas automáticas reconocibles. Si Resend tarda en facilitar el cuerpo, conserva el asunto y la pausa de la secuencia mientras llegan los reintentos. La decisión y la respuesta personal corresponden al asesor.

Para verificar la configuración, consulta la [documentación de recepción de Resend](https://resend.com/docs/webhooks/emails/received) y la [lectura de correo entrante](https://resend.com/docs/api-reference/emails/retrieve-received-email).
