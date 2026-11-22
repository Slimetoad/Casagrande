# Verificación independiente: plataforma de posgrados

Revisión del 22 de noviembre de 2026. La batería independiente usó SQLite en memoria e identidades y respuestas de proveedores simuladas. También se aplicaron los dos archivos de migración en D1 local y se recorrió la agenda desde un navegador con un contacto ficticio.

## Resultados reproducibles

La versión candidata aprobó las 77 pruebas automatizadas, la comprobación de tipos y el análisis estático. En la compilación local de producción respondieron las 42 rutas examinadas, incluidas las 34 fichas, la agenda y la consola de demostración. Las rutas de admisiones, conversión y verificación exigieron autorización.

- `npm test` sobre la versión inicial: 24 pruebas, 24 aprobadas. Cubren captura y atribución, reintentos, bajas, etapas, mensajes de Resend y Twilio simulados, respuestas recibidas, catálogo, CRM y orientador.
- `node --test tests/judge-regression.mjs tests/judge-calendar.mjs`: Las pruebas de agenda comprueban rechazo de solapamientos y horarios vencidos, consentimiento, reintentos, competencia simultánea por una franja (una reserva y un conflicto), asignación por personal y cancelación privada repetida. Las tres pruebas de consentimiento y acceso comprueban que texto como `"true"` no concede permisos, que una baja seguida de un nuevo formulario y de dos hitos no reactiva el envío, y que cuatro rutas de personal rechazan sesiones ausentes o fuera de la lista y aceptan la identidad simulada autorizada. La base se crea aplicando en orden las migraciones SQL numeradas; esto no demuestra una actualización D1 remota ni la configuración del proxy.
- La revisión incluye la exportación al calendario. El archivo ICS usa un identificador independiente del enlace privado para consultar o cancelar una reserva.
- Los escenarios sobre proveedores existentes simulan sus respuestas y firmas; no prueban entregabilidad, cobertura telefónica, límites reales ni disponibilidad de credenciales.

## Evidencia institucional y límites

- Una comprobación puntual de la [ficha oficial de Comunicación Estratégica e Imagen Institucional](https://posgrados.casagrande.edu.ec/maestrias?action=vermaestria&id=OPPQQRRSSTTUUVVWWXXU) coincide con el catálogo en modalidad en línea, 12 meses y USD 2800; la copia indexada consultada tenía unos dos meses. Precio, convocatoria y condiciones requieren confirmación actual con UCG.
- La [ficha oficial de Inteligencia Artificial y Analítica de Datos](https://www.casagrande.edu.ec/posgrado/maestria-en-ia-y-ciencia-de-datos) muestra ese nombre y título, dos semestres y resolución RPC-SO-17-No.315-2024. Su [folleto enlazado](https://assets.casagrande.edu.ec/web/study-plans/postgraduate/FOLLETO-CIENCIA-DE-DATOS.pdf) emplea «Inteligencia Artificial y Ciencia de Datos», identifica la misma resolución y menciona cohorte 2025; las cuatro asignaturas seleccionadas del catálogo aparecen en ese folleto. Se conserva el nombre de la ficha actual y se recomienda que UCG resuelva la discrepancia y confirme la malla de cada cohorte. El extracto de búsqueda consultado inicialmente era obsoleto: la página completa muestra el nombre actual.
- Esta revisión puntual no valida todos los programas, matrículas, precios, becas, fechas ni cupos. La presencia de una ficha no demuestra que exista una convocatoria abierta.

## Condiciones y riesgos pendientes

1. El acceso interno confía en cabeceras de identidad y una lista de correos. Hay que verificar que la infraestructura quite o sobrescriba cabeceras de identidad proporcionadas por visitantes y que no se pueda acceder al worker por una ruta que eluda esa protección. La prueba local modela un proxy confiable; no lo verifica.
2. El despachador de Resend y Twilio volvió a comprobar el consentimiento inmediatamente antes de solicitar el envío. Una baja concurrente con una petición ya iniciada o aceptada por un tercero puede requerir conciliación; no se ha verificado ese comportamiento en proveedores reales.
3. Retell y WhatsApp no están verificados para producción por esta revisión. La batería de integraciones comprueba con dobles de prueba los permisos de canal, la recepción de eventos firmados, las bajas y los reintentos. Queda validar los remitentes, las plantillas, el agente de voz y la ruta de telefonía mediante cuentas autorizadas.
4. La disponibilidad local distingue un horario publicado de una reserva confirmada. La prueba de concurrencia utiliza SQLite en memoria. La disponibilidad de la agenda procede de los horarios que el personal publica en el CRM.

## Recorridos en navegador

Desde la ficha del MBA se comprobó que la agenda conserva el programa elegido. Con la agenda local vacía se registró una solicitud de horario, se consultó el resultado y se canceló desde su enlace privado. Los datos del ensayo eran ficticios.
