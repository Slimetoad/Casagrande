// Propuestas de orientación editorial, no métricas de búsqueda ni contenido aprobado.
// Las fichas y folletos UCG del catálogo son el punto de partida; confirmar cohorte y vigencia.
const seed=(cluster,intent,title,searchQuestion,angle,points)=>({cluster,intent,title,searchQuestion,angle,points});
export const editorialSeeds={
 'maestria-en-administracion-de-empresas':seed('Estrategia y analítica','aplicacion','Cómo usar datos para decidir una estrategia empresarial','analítica de negocios para decisiones empresariales Ecuador','Un caso de decisiones para una empresa ecuatoriana que compara alternativas antes de invertir.',[
  'Define una decisión concreta, como ampliar una línea de productos, y distingue lo que se sabe de lo que aún necesita investigación.',
  'Relaciona economía para negocios y visualización de datos con la comparación de escenarios; explica qué supuestos podrían cambiar el resultado.',
  'Describe cómo presentar la recomendación al equipo directivo e identifica las materias de liderazgo y operaciones en la ficha oficial.' ]),
 'maestria-en-ia-y-ciencia-de-datos':seed('IA y datos','aplicacion','De una pregunta de negocio a un proyecto de inteligencia artificial','cómo aplicar inteligencia artificial y analítica de datos en empresas','Una guía para evaluar un proyecto sin prometer que todos los problemas necesitan un modelo complejo.',[
  'Formula una pregunta medible y distingue una descripción de datos de una predicción que tendría que validarse.',
  'Revisa calidad, procedencia y autorización de los datos antes de elegir técnicas; limita el acceso a información personal.',
  'Conecta aprendizaje estadístico, estrategias de ciencia de datos y gobernanza de IA con el temario publicado y pide confirmar la malla vigente.' ]),
 'comunicacion-estrategica-e-imagen-institucional':seed('Comunicación institucional','aplicacion','Cómo diseñar una campaña que cuide la imagen institucional','campaña de comunicación e imagen institucional Ecuador','De un problema de reputación a objetivos, públicos y evaluación, sin inventar resultados de campaña.',[
  'Identifica qué necesita comprender cada público de una institución ecuatoriana antes de definir mensajes y canales.',
  'Relaciona gestión de comunicación corporativa y relaciones públicas con decisiones sobre portavocía y coherencia institucional.',
  'Propón una forma de evaluar comprensión y respuesta del público, y contrasta el plan con la ficha académica oficial.' ]),
 'maestria-en-administracion-educativa':seed('Gestión educativa','aplicacion','Cómo convertir un diagnóstico escolar en un plan de mejora','plan de mejora para instituciones educativas Ecuador','Una ruta para directivos que necesitan vincular prioridades académicas y recursos.',[
  'Delimita un problema de gestión de un centro educativo y recoge información de docentes, familias y estudiantes sin identificar a menores.',
  'Relaciona planificación estratégica, gestión académica y evaluación curricular con un objetivo de mejora verificable.',
  'Examina recursos, inclusión y seguimiento, y consulta la normativa ecuatoriana vigente y la malla con las autoridades correspondientes.' ]),
 'maestria-en-ciberseguridad':seed('Seguridad digital','aplicacion','Cómo priorizar riesgos y continuidad en una organización','gestión de riesgos y continuidad de ciberseguridad Ecuador','Una guía de planificación defensiva para responsables de información.',[
  'Identifica servicios esenciales, responsables y consecuencias de una interrupción antes de elegir controles.',
  'Explica cómo combinar políticas de seguridad, respaldo y continuidad del negocio con ejercicios internos autorizados.',
  'Vincula auditoría, defensa de redes y seguridad de aplicaciones con el plan publicado, sin presentar certificaciones como garantizadas.' ]),
 'maestria-en-derecho-digital':seed('Derecho y tecnología','aplicacion','Qué revisar al incorporar datos personales en un servicio digital','protección de datos y derecho digital Ecuador','Una lista de preguntas para equipos jurídicos y de producto, sujeta a revisión legal.',[
  'Describe el recorrido de los datos, las personas responsables y la finalidad antes de proponer funcionalidades digitales.',
  'Revisa con asesoría jurídica la normativa ecuatoriana vigente, la información a titulares y los contratos con proveedores.',
  'Relaciona protección de datos, inteligencia artificial y propiedad intelectual con los temas de la ficha; evita tratar el artículo como asesoría individual.' ]),
 'maestria-en-administracion-publica':seed('Gestión pública','aplicacion','De una necesidad ciudadana a un proyecto público evaluable','planificación y gestión pública Ecuador','Un ejercicio de gestión para un equipo público, centrado en objetivos y transparencia.',[
  'Formula el problema con una población y territorio definidos y explica qué evidencia faltaría para dimensionarlo.',
  'Vincula planificación, finanzas públicas y compras con las decisiones que una entidad debe verificar en sus procedimientos vigentes.',
  'Propón indicadores y un mecanismo de rendición de cuentas, conectándolos con gobierno abierto y auditoría del plan de estudios.' ]),
 'maestria-en-comunicacion':seed('Comunicación digital','aplicacion','Cómo planificar una historia para varios canales digitales','narrativas transmedia y comunicación digital Ecuador','Una guía de diseño de contenidos que considera audiencia, accesibilidad y medición.',[
  'Elige una necesidad de comunicación y decide qué aporta cada canal, evitando copiar la misma pieza en todos.',
  'Relaciona narrativas transmedia, ecología de medios y experiencia de usuario con un recorrido coherente para la audiencia.',
  'Define señales de comprensión y analítica web, sin confundir alcance con resultados institucionales.' ]),
 'maestria-en-educacion-mencion-innovaciones-pedagogicas':seed('Innovación pedagógica','aplicacion','Cómo evaluar una actividad de aprendizaje activo','aprendizaje activo y evaluación docente Ecuador','Una secuencia de aula que integra planificación, participación y evidencia del aprendizaje.',[
  'Parte de un objetivo de aprendizaje y diseña una actividad en la que el estudiante aplique o contraste una idea.',
  'Planifica cómo observar el proceso y recoger retroalimentación, sin reducir la evaluación a una herramienta digital.',
  'Relaciona diseño instruccional, diversidad y evaluación del aprendizaje activo con el folleto y consulta la malla de la cohorte.' ]),
 'maestria-en-cadena-de-suministro':seed('Logística y sostenibilidad','aplicacion','Cómo equilibrar inventario, abastecimiento y sostenibilidad','gestión de cadena de suministro inventarios Ecuador','Una guía para revisar decisiones logísticas bajo supuestos explícitos.',[
  'Dibuja el recorrido de un producto desde abastecimiento hasta entrega e identifica dónde se producen esperas o faltantes.',
  'Compara demanda, inventarios y compras con escenarios sencillos; no presentes una reducción de costos como resultado garantizado.',
  'Examina logística internacional y compras sostenibles con las fuentes aplicables a la organización y el plan académico publicado.' ]),
 'maestria-en-marketing-estrategico':seed('Marketing y analítica','aplicacion','Qué medir antes de automatizar una campaña de marketing','analítica de marketing e inteligencia artificial Ecuador','Cómo formular una pregunta comercial, seleccionar datos y evaluar una intervención.',[
  'Define una audiencia y una decisión de marketing antes de elegir una herramienta de inteligencia artificial.',
  'Distingue métricas de exposición, interacción y resultados, y documenta límites de atribución y uso de datos personales.',
  'Conecta análisis de mercados, comunicaciones integradas y evaluación de la gestión con el programa oficial.' ]),
 'maestria-en-neuropsicologia':seed('Aprendizaje y desarrollo','programa','Cómo explorar la neuropsicología del aprendizaje en contextos educativos','maestría neuropsicología aprendizaje Ecuador','Orientación académica que diferencia comprensión del aprendizaje de diagnóstico o tratamiento individual.',[
  'Compara las preguntas que abordan la psicología educativa y la neuropsicología del desarrollo al observar un proceso de aprendizaje.',
  'Explica por qué una observación escolar no sustituye una evaluación profesional ni autoriza un diagnóstico.',
  'Revisa neurobiología, aprendizaje en contexto digital y asistencia a familias en el plan publicado; confirma perfil de ingreso con admisiones.' ]),
 'maestria-en-pedagogia-de-los-idiomas':seed('Enseñanza de inglés','aplicacion','Cómo diseñar una actividad comunicativa para aprender inglés','enseñanza comunicativa inglés evaluación Ecuador','Una actividad docente que conecta adquisición de segunda lengua y evaluación.',[
  'Plantea una tarea comunicativa con un propósito real y ajusta su complejidad al grupo sin asumir un nivel uniforme.',
  'Explica cómo recoger evidencia de comprensión y producción, y cómo dar retroalimentación útil.',
  'Relaciona adquisición de segunda lengua, diseño instruccional e investigación de aula con el plan de la maestría.' ]),
 'derecho-administrativo-y-contratacion-publica':seed('Contratación pública','aplicacion','Qué revisar antes de estudiar un caso de contratación pública','contratación pública procedimiento Ecuador estudio','Una ruta de lectura jurídica que evita describir reglas o plazos sin verificar su vigencia.',[
  'Separa la necesidad pública, la competencia de la entidad y la documentación que debe revisarse en el expediente.',
  'Consulta normativa, procedimientos y fuentes oficiales vigentes antes de interpretar un caso concreto.',
  'Conecta el sistema de contratación pública, la preparación documental y el análisis jurisprudencial con el programa oficial.' ]),
 'administracion-de-empresas-management':seed('Dirección de empresas','comparacion','Cómo elegir formación en dirección y gestión empresarial','maestría management dirección de empresas Ecuador','Criterios para comparar una formación generalista de management con objetivos profesionales propios.',[
  'Describe si tu prioridad es dirigir equipos, organizar operaciones o tomar decisiones financieras, y convierte esa prioridad en preguntas para admisiones.',
  'Revisa cómo se relacionan dirección estratégica, gestión comercial y recursos humanos en el plan publicado.',
  'Antes de decidir, compara requisitos, horarios y condiciones vigentes de cada opción sin asumir equivalencia entre menciones.' ]),
 'comunicacion-y-creacion-de-contenidos-con-ia':seed('Contenidos e IA','aplicacion','Cómo planificar contenidos con IA y revisión editorial','creación de contenidos con inteligencia artificial comunicación Ecuador','Un flujo de trabajo donde la herramienta no sustituye fuentes, criterio editorial ni derechos.',[
  'Parte de una pregunta de la audiencia y define qué información debe comprobarse antes de producir una pieza.',
  'Organiza ideación, revisión humana y adaptación a formatos digitales; registra fuentes y permisos de uso.',
  'Relaciona analítica de comunicación, inteligencia artificial y narrativa transmedia con la malla publicada.' ]),
 'contabilidad-y-auditoria':seed('Auditoría y tributación','aplicacion','Cómo conectar estados financieros, auditoría y gestión tributaria','auditoría financiera gestión tributaria Ecuador','Un recorrido por la información que necesita una organización antes de revisar riesgos.',[
  'Identifica el período, la documentación contable y los responsables de preparar y revisar los estados financieros.',
  'Distingue la revisión de riesgos de auditoría de las decisiones tributarias y consulta la normativa vigente con profesionales competentes.',
  'Relaciona información financiera, control y sistema tributario ecuatoriano con las asignaturas de la ficha.' ]),
 'derecho-constitucional':seed('Derecho constitucional','aplicacion','Cómo ordenar el análisis de una garantía constitucional','garantías constitucionales estudio Ecuador','Una guía académica de lectura jurídica, sin sustituir el análisis de un caso real.',[
  'Identifica el derecho alegado, los hechos relevantes y la decisión que se necesita revisar.',
  'Consulta el texto vigente y la jurisprudencia pertinente antes de comparar garantías y mecanismos de protección.',
  'Relaciona control constitucional y sistema interamericano con la ficha de la mención; pide asesoría para asuntos particulares.' ]),
 'derecho-procesal-penal':seed('Proceso penal','aplicacion','Cómo preparar el estudio de la prueba en un proceso penal','estudio prueba proceso penal Ecuador','Una lectura académica de hechos y evidencia con enfoque de derechos y debido proceso.',[
  'Distingue la afirmación que debe probarse de los elementos disponibles y de lo que aún no se conoce.',
  'Consulta la legislación y jurisprudencia actualizadas antes de evaluar admisibilidad, contradicción y garantías.',
  'Relaciona prueba, criminalística y litigación oral con el programa, sin convertir el artículo en consejo para un caso.' ]),
 'derecho-laboral-publico-y-privado':seed('Relaciones laborales','comparacion','Qué preguntas hacer al comparar relaciones laborales públicas y privadas','derecho laboral público privado Ecuador diferencias','Una comparación académica basada en fuentes vigentes, sin asumir que ambos regímenes son iguales.',[
  'Identifica la institución, la naturaleza del vínculo y los documentos aplicables antes de comparar situaciones.',
  'Consulta con asesoría especializada las fuentes vigentes sobre garantías, prevención de violencia y terminación.',
  'Conecta transformación digital, sumario administrativo y negociación colectiva con las materias publicadas.' ]),
 'derecho-tributario':seed('Derecho tributario','aplicacion','Cómo investigar una controversia tributaria sin perder el contexto','derecho tributario contribuyente Ecuador investigación','Una guía de investigación que distingue obligaciones, procedimientos y defensa.',[
  'Ordena hechos, períodos, documentos y la autoridad involucrada antes de formular una pregunta jurídica.',
  'Verifica normativa y criterios oficiales actuales; no extrapoles una regla nacional a una obligación municipal sin revisión.',
  'Relaciona protección del contribuyente, fiscalidad de gobiernos descentralizados y derecho procesal tributario con la malla.' ]),
 'direccion-comercial-y-ventas':seed('Dirección comercial','aplicacion','Cómo organizar una venta consultiva con información del cliente','venta consultiva y gestión clientes Ecuador','Una guía que une preguntas comerciales, seguimiento y uso responsable de datos.',[
  'Define qué problema quiere resolver el cliente y registra solo la información necesaria para atenderlo.',
  'Diseña una secuencia de seguimiento con acuerdos claros, criterios para detenerla y revisión de sus resultados.',
  'Vincula venta consultiva, CRM y analítica comercial con el plan publicado, sin prometer aumentos de ventas.' ]),
 'docencia-e-investigacion-en-educacion-superior':seed('Docencia universitaria','aplicacion','Cómo transformar una pregunta docente en investigación educativa','investigación docencia educación superior Ecuador','Una ruta para mejorar una asignatura universitaria mediante evidencia y reflexión docente.',[
  'Delimita una dificultad de aprendizaje y plantea una pregunta que se pueda observar en un curso concreto.',
  'Compara métodos de investigación y evaluación, atendiendo a consentimiento, confidencialidad y ética institucional.',
  'Relaciona planificación curricular, evaluación universitaria y difusión de resultados con la ficha oficial.' ]),
 'educacion-basica':seed('Educación básica','aplicacion','Cómo alinear una actividad de aula con la evaluación del aprendizaje','planificación y evaluación educación básica Ecuador','Un ejemplo docente que parte de una meta y adapta la actividad a la diversidad del grupo.',[
  'Elige una meta de aprendizaje apropiada al contexto y confirma los lineamientos curriculares ecuatorianos vigentes.',
  'Diseña una actividad de interaprendizaje e indica qué evidencias permitirían ofrecer retroalimentación.',
  'Revisa la participación de familias y las necesidades de inclusión, vinculándolas al plan publicado.' ]),
 'educacion-inclusiva':seed('Educación inclusiva','aplicacion','Cómo revisar barreras de participación en una actividad educativa','educación inclusiva intervención psicoeducativa Ecuador','Una guía para adaptar una actividad sin etiquetar ni diagnosticar a estudiantes.',[
  'Describe la actividad, el entorno y las barreras observables antes de atribuir una dificultad al estudiante.',
  'Explora alternativas de comunicación, materiales y participación con docentes, familias y profesionales pertinentes.',
  'Relaciona diversidad, diseño didáctico y entornos inclusivos con la ficha UCG, verificando los apoyos disponibles.' ]),
 'educacion-inicial':seed('Primera infancia','aplicacion','Cómo planificar una experiencia de juego en educación inicial','juego y aprendizaje educación inicial Ecuador','Una propuesta de planificación para docentes y familias que respeta el desarrollo de cada niño.',[
  'Define qué se busca observar mediante un juego motor o colaborativo y adapta materiales a la edad y al contexto.',
  'Incluye educación emocional y diálogo con familias sin convertir observaciones cotidianas en diagnósticos.',
  'Relaciona juego, inclusión y orientación familiar con la ficha académica y los lineamientos vigentes.' ]),
 'gerencia-en-servicios-de-la-salud':seed('Gestión de salud','aplicacion','Cómo analizar una mejora en un servicio de salud','gestión calidad servicios de salud Ecuador','Un caso de gestión de procesos que no ofrece indicaciones clínicas.',[
  'Describe un proceso de atención, sus puntos de espera y las personas responsables, sin incluir información de pacientes.',
  'Selecciona indicadores operativos y de calidad y contrasta su interpretación con el equipo de salud.',
  'Relaciona gestión de operaciones, recursos y sistemas de información con el programa; verifica protocolos vigentes de la institución.' ]),
 'gestion-del-talento-humano':seed('Talento y organizaciones','aplicacion','Cómo alinear desarrollo del talento y objetivos de una organización','desarrollo talento humano organizaciones Ecuador','Una ruta para pasar de necesidades de equipo a un plan de desarrollo medible.',[
  'Identifica una necesidad de capacidades y recaba perspectivas de colaboradores y responsables sin revelar datos personales.',
  'Conecta formación, evaluación y retención con objetivos verificables, evitando atribuir resultados a una sola actividad.',
  'Revisa dirección del capital humano, habilidades directivas y desarrollo organizacional en la ficha del programa.' ]),
 'gestion-de-proyectos':seed('Gestión de proyectos','aplicacion','Cómo elegir un enfoque de gestión para un proyecto','gestión de proyectos enfoque ágil planificación Ecuador','Una comparación práctica de decisiones de proyecto según incertidumbre y actores.',[
  'Define el resultado esperado, los involucrados y las restricciones de tiempo, recursos y alcance.',
  'Compara qué decisiones conviene planificar anticipadamente y cuáles necesitan ciclos de aprendizaje y revisión.',
  'Relaciona indicadores económicos, contexto y enfoque ágil con el programa; confirma con el equipo las metodologías aplicables.' ]),
 'gestion-innovacion-y-liderazgo-educativo':seed('Liderazgo educativo','aplicacion','Cómo liderar una mejora educativa con el equipo docente','liderazgo e innovación gestión educativa Ecuador','Un ejercicio de liderazgo que une diagnóstico institucional, gestión y evaluación.',[
  'Acuerda con el equipo un problema concreto de aprendizaje o gestión antes de proponer una innovación.',
  'Planifica recursos, responsabilidades y espacios para escuchar a la comunidad educativa.',
  'Relaciona liderazgo, gestión curricular y evaluación institucional con la ficha; revisa las políticas educativas aplicables.' ]),
 'pedagogia-de-las-matematicas':seed('Didáctica de matemáticas','aplicacion','Cómo conectar estadística escolar con una pregunta del entorno','didáctica estadística matemáticas educación Ecuador','Un proyecto de aula que vincula datos, interpretación y evaluación de razonamientos.',[
  'Formula con el grupo una pregunta sencilla sobre su entorno y selecciona datos que puedan recogerse sin identificar personas.',
  'Compara representaciones y discute incertidumbre o limitaciones antes de sacar conclusiones.',
  'Relaciona probabilidad, estadística y evaluación del aprendizaje con el plan de la mención y el currículo vigente.' ]),
 'psicologia-organizacional':seed('Psicología del trabajo','aplicacion','Cómo estudiar un problema de bienestar laboral sin simplificarlo','bienestar laboral psicología organizacional Ecuador','Una guía para formular preguntas organizacionales y proteger la privacidad del equipo.',[
  'Describe condiciones de trabajo y señales agregadas antes de atribuir un problema a características individuales.',
  'Planifica la escucha, la confidencialidad y la derivación a profesionales competentes cuando corresponda.',
  'Relaciona comportamiento organizacional, gestión de conflictos y ética con la ficha publicada; no presentes el texto como diagnóstico.' ]),
 'salud-y-seguridad-ocupacional':seed('Seguridad y salud laboral','aplicacion','Cómo priorizar una revisión preventiva de riesgos laborales','prevención riesgos salud seguridad ocupacional Ecuador','Una ruta de gestión preventiva que requiere evaluación y asesoría especializada.',[
  'Identifica tareas, lugares y posibles exposiciones junto con trabajadores y responsables de seguridad.',
  'Distingue riesgos de seguridad, higiene y ergonomía y contrasta la documentación y normativa ecuatoriana vigente.',
  'Relaciona el seguimiento de controles y la mejora con los contenidos de salud laboral e ISO 45001 de la ficha, sin afirmar certificación.' ]),
 'urbanismo-y-planificacion-territorial':seed('Territorio y ciudades','aplicacion','Cómo preparar un diagnóstico para la planificación territorial','diagnóstico planificación territorial Ecuador SIG','Una guía para conectar evidencia espacial, participación y decisiones territoriales.',[
  'Delimita un territorio y una pregunta sobre acceso, ambiente o crecimiento, indicando qué datos faltan.',
  'Combina fuentes geográficas y conocimiento local, y revisa su fecha y escala antes de compararlas.',
  'Relaciona SIG, planificación territorial en Ecuador y sostenibilidad urbana con la ficha; consulta los instrumentos vigentes del territorio.' ])
};
