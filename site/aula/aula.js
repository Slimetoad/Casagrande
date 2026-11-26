import { createThreeBlueEngine } from './engine-3b1b.js?v=aula-qual-4';
import {
  createAvatarKokoroController,
  VOICE_PROFILES,
  DEFAULT_AVATAR_URL
} from './avatar-kokoro.js?v=kokoro-es-2';

const DEFAULT_API_BASE = 'https://casagrande-posgrados-production.up.railway.app';

const OFFLINE_CURATED_COURSES = [
  {
    id: 'algebra-lineal-visual',
    slug: 'algebra-lineal-visual',
    topic: 'Álgebra lineal, matrices y transformaciones geométricas',
    title: 'Esencia del Álgebra Lineal y Transformaciones',
    subtitle: 'Comprende matrices, determinantes y eigenvectores observando cómo el espacio completo se estira y rota en tiempo real.',
    programSlug: null,
    level: 'Introductorio',
    voiceId: 'ef_dora',
    source: 'curated',
    renderer: 'vector_space',
    lessons: [
      {
        id: 'al-l1-vectores-base',
        title: 'Vectores base y matrices como movimiento',
        summary: 'Una matriz 2x2 indica exactamente adónde aterrizan los vectores base î y ĵ tras deformar el plano.',
        renderer: 'vector_space',
        equation: 'T(\\vec{v}) = \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix} \\begin{bmatrix} x \\\\ y \\end{bmatrix}',
        explorePrompt: 'Arrastra las puntas de î y ĵ en el lienzo o mueve a, b, c y d para invertir el plano.',
        params: [
          { id: 'a', label: 'Componente îₓ (a)', min: -2.5, max: 2.5, step: 0.1, default: 1.5, unit: '' },
          { id: 'b', label: 'Componente ĵₓ (b)', min: -2.5, max: 2.5, step: 0.1, default: 0.6, unit: '' },
          { id: 'c', label: 'Componente îᵧ (c)', min: -2.5, max: 2.5, step: 0.1, default: -0.4, unit: '' },
          { id: 'd', label: 'Componente ĵᵧ (d)', min: -2.5, max: 2.5, step: 0.1, default: 1.2, unit: '' }
        ],
        beats: [
          {
            t: 0,
            title: 'La cuadrícula viva',
            caption: 'Antes de operar con números, observa dónde vive cada vector del plano.',
            equation: '\\hat{i} = [1, 0]^T, \\quad \\hat{j} = [0, 1]^T',
            mood: 'curious',
            speechText: 'Una matriz describe un movimiento ordenado del espacio: las líneas paralelas siguen siendo paralelas y el origen permanece fijo.',
            sceneState: { a: 1, b: 0, c: 0, d: 1, showDeterminant: false }
          },
          {
            t: 10,
            title: 'Seguir a î y ĵ',
            caption: 'Cada columna de la matriz guarda la nueva posición de î y ĵ.',
            equation: 'A = \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}',
            mood: 'excited',
            speechText: 'Si conoces adónde llegan los vectores base î y ĵ, conoces automáticamente el destino de cualquier vector del plano.',
            sceneState: { a: 1.5, b: 0.5, c: 0.2, d: 1.3, showDeterminant: true }
          },
          {
            t: 22,
            title: 'El determinante como área',
            caption: 'El área del paralelogramo sombreado mide cuánto se escala el espacio.',
            equation: '\\det(A) = ad - bc',
            mood: 'emphatic',
            speechText: 'El determinante mide el factor de escala del área. Cuando se vuelve cero, todo el plano colapsa sobre una línea.',
            sceneState: { a: 1.4, b: 0.8, c: 0.4, d: 1.1, showDeterminant: true, showEigenvectors: true }
          }
        ],
        quiz: {
          question: '¿Qué representan geométricamente las dos columnas de una matriz 2x2?',
          options: [
            'Las coordenadas finales de los vectores base î y ĵ',
            'Únicamente los ángulos respecto al origen',
            'La suma de todas las coordenadas del plano',
            'El inverso multiplicativo del determinante'
          ],
          correctIndex: 0,
          explanation: 'Cada columna registra exactamente adónde aterriza cada vector base tras la transformación.'
        }
      }
    ]
  },
  {
    id: 'redes-neuronales-desde-cero',
    slug: 'redes-neuronales-desde-cero',
    topic: 'Redes neuronales, fronteras de decisión y backpropagation',
    title: 'Redes Neuronales y Backpropagation desde Cero',
    subtitle: 'Observa cómo pesos, sesgos y activaciones transforman señales crudas en decisiones inteligentes.',
    programSlug: 'maestria-en-ia-y-ciencia-de-datos',
    level: 'Intermedio',
    voiceId: 'em_alex',
    source: 'curated',
    renderer: 'neural_network',
    lessons: [
      {
        id: 'nn-l1-neurona',
        title: 'De combinaciones lineales a fronteras de decisión',
        summary: 'Cada neurona pondera sus entradas, suma un sesgo y curva la respuesta mediante una activación no lineal.',
        renderer: 'neural_network',
        equation: '\\hat{y} = \\sigma(w_1 x_1 + w_2 x_2 + b)',
        explorePrompt: 'Modifica w₁, w₂ y el sesgo b para girar y desplazar la frontera de decisión en el mapa de calor.',
        params: [
          { id: 'w1', label: 'Peso w₁', min: -3, max: 3, step: 0.1, default: 1.6, unit: '' },
          { id: 'w2', label: 'Peso w₂', min: -3, max: 3, step: 0.1, default: -1.1, unit: '' },
          { id: 'bias', label: 'Sesgo (b)', min: -3, max: 3, step: 0.1, default: 0.2, unit: '' },
          { id: 'inputA', label: 'Entrada x₁', min: 0, max: 1, step: 0.05, default: 0.75, unit: '' }
        ],
        beats: [
          {
            t: 0,
            title: 'La propagación hacia adelante',
            caption: 'Las señales viajan capa a capa amplificadas por pesos positivos y negativos.',
            equation: 'z = w_1 x_1 + w_2 x_2 + b',
            mood: 'curious',
            speechText: 'Una red neuronal transforma datos en decisiones mediante capas conectadas. Cada enlace amplifica o atenúa la señal según su peso.',
            sceneState: { stage: 'forward', w1: 1.5, w2: -0.9, bias: 0.1, inputA: 0.7 }
          },
          {
            t: 11,
            title: 'Frontera de decisión',
            caption: 'El mapa de calor muestra qué región clasifica la red con mayor confianza.',
            equation: '\\sigma(z) = \\frac{1}{1 + e^{-z}}',
            mood: 'excited',
            speechText: 'Al cambiar los pesos w1 y w2, rotas la frontera que separa las clases. El sesgo b desplaza esa frontera sin cambiar su ángulo.',
            sceneState: { stage: 'boundary', w1: 2.0, w2: 1.1, bias: -0.3, inputA: 0.85 }
          },
          {
            t: 22,
            title: 'Aprender reduciendo el error',
            caption: 'Backpropagation ajusta cada peso en sentido contrario al gradiente de pérdida.',
            equation: 'w \\leftarrow w - \\eta \\frac{\\partial L}{\\partial w}',
            mood: 'emphatic',
            speechText: 'Durante el entrenamiento, el algoritmo mide el error en la salida y propaga hacia atrás cuánto debe ajustarse cada peso.',
            sceneState: { stage: 'backprop', w1: 1.6, w2: -1.1, bias: 0.2, inputA: 0.75 }
          }
        ],
        quiz: {
          question: '¿Qué papel cumple el sesgo (bias) en una neurona artificial?',
          options: [
            'Desplaza el umbral de activación sin depender de rotar los pesos',
            'Elimina la función de activación sigmoide',
            'Obliga a que todos los pesos sean positivos',
            'Sustituye completamente los datos de entrada'
          ],
          correctIndex: 0,
          explanation: 'El sesgo traslada la frontera de decisión, permitiendo que la neurona se active aun cuando las entradas son bajas o nulas.'
        }
      }
    ]
  },
  {
    id: 'calculo-visual-derivadas-gradientes',
    slug: 'calculo-visual-derivadas-gradientes',
    topic: 'Cálculo diferencial, integrales de Riemann y descenso de gradiente',
    title: 'Cálculo Visual: Derivadas, Integrales y Gradientes',
    subtitle: 'Visualiza el límite Δx → 0, el área acumulada bajo la curva y la optimización moderna.',
    programSlug: null,
    level: 'Introductorio',
    voiceId: 'ef_dora',
    source: 'curated',
    renderer: 'calculus_curve',
    lessons: [
      {
        id: 'calc-l1-derivada',
        title: 'La derivada como zoom infinitesimal',
        summary: 'Cuando h tiende a cero, la recta secante se funde con la tangente instantánea en x₀.',
        renderer: 'calculus_curve',
        equation: "f'(x_0) = \\lim_{h \\to 0} \\frac{f(x_0 + h) - f(x_0)}{h}",
        explorePrompt: 'Arrastra x₀ sobre la curva y reduce h hacia 0.05 para ver colapsar el triángulo secante.',
        params: [
          { id: 'x0', label: 'Punto x₀', min: -2.5, max: 2.5, step: 0.1, default: 1.0, unit: '' },
          { id: 'h', label: 'Paso Δx (h)', min: 0.05, max: 2.0, step: 0.05, default: 0.8, unit: '' },
          { id: 'n', label: 'Particiones (n)', min: 2, max: 32, step: 1, default: 8, unit: '' }
        ],
        beats: [
          {
            t: 0,
            title: 'Cambio promedio entre dos puntos',
            caption: 'La secante mide la pendiente media sobre un intervalo h.',
            equation: '\\frac{\\Delta y}{\\Delta x} = \\frac{f(x_0+h)-f(x_0)}{h}',
            mood: 'curious',
            speechText: 'La pendiente promedio entre dos puntos de una curva se calcula dividiendo cuánto sube la función entre el ancho h.',
            sceneState: { mode: 'derivative', x0: 0.9, h: 1.2 }
          },
          {
            t: 11,
            title: 'Colapsar h hacia cero',
            caption: 'Al achicar h, la secante revela la tasa de cambio instantánea.',
            equation: "f'(x_0) = \\lim_{h \\to 0}\\frac{f(x_0+h)-f(x_0)}{h}",
            mood: 'excited',
            speechText: 'Conforme acercamos h hacia cero, ese pequeño triángulo nos revela la pendiente exacta en un instante único.',
            sceneState: { mode: 'derivative', x0: 1.1, h: 0.1 }
          },
          {
            t: 22,
            title: 'Área acumulada e integral',
            caption: 'Al multiplicar por más rectángulos n, la suma se aproxima al área exacta.',
            equation: '\\int_a^b f(x)\\,dx = \\lim_{n\\to\\infty}\\sum_{i=1}^n f(x_i)\\,\\Delta x',
            mood: 'emphatic',
            speechText: 'El camino inverso consiste en acumular rectángulos delgados bajo la curva: esa es la esencia visual de la integral.',
            sceneState: { mode: 'integral', x0: 1.2, n: 18 }
          }
        ],
        quiz: {
          question: '¿Qué ocurre visualmente cuando h disminuye hacia cero en la definición de derivada?',
          options: [
            'La recta secante converge hacia la recta tangente en x₀',
            'La curva se convierte en una línea horizontal constante',
            'El área bajo la curva desaparece por completo',
            'La pendiente siempre se vuelve negativa'
          ],
          correctIndex: 0,
          explanation: 'Al tender h a cero, los dos puntos de intersección coinciden en x₀ y la secante se convierte en la tangente.'
        }
      }
    ]
  },
  {
    id: 'pensamiento-bayesiano-probabilidad',
    slug: 'pensamiento-bayesiano-probabilidad',
    topic: 'Teorema de Bayes, probabilidad condicional y distribución normal',
    title: 'Pensamiento Bayesiano y Probabilidad Visual',
    subtitle: 'Actualiza creencias bajo incertidumbre observando áreas proporcionales de evidencia.',
    programSlug: 'maestria-en-administracion-de-empresas',
    level: 'Intermedio',
    voiceId: 'em_santa',
    source: 'curated',
    renderer: 'probability_dist',
    lessons: [
      {
        id: 'bayes-l1-areas',
        title: 'Bayes como proporción de áreas',
        summary: 'La probabilidad posterior compara los verdaderos positivos contra todos los casos que disparan la señal.',
        renderer: 'probability_dist',
        equation: 'P(H\\mid E) = \\frac{P(H)\\,P(E\\mid H)}{P(E)}',
        explorePrompt: 'Reduce la probabilidad previa P(H) a 0.05 y observa cómo los falsos positivos dominan la señal.',
        params: [
          { id: 'prior', label: 'Probabilidad previa P(H)', min: 0.01, max: 0.95, step: 0.01, default: 0.12, unit: '' },
          { id: 'sensitivity', label: 'Sensibilidad P(E|H)', min: 0.5, max: 0.99, step: 0.01, default: 0.92, unit: '' },
          { id: 'falsePos', label: 'Falso positivo P(E|¬H)', min: 0.01, max: 0.4, step: 0.01, default: 0.08, unit: '' }
        ],
        beats: [
          {
            t: 0,
            title: 'El cuadrado unitario de posibilidades',
            caption: 'Dividimos la población total entre hipótesis verdadera y falsa.',
            equation: 'P(H) + P(\\neg H) = 1',
            mood: 'curious',
            speechText: 'Imagina un cuadrado completo que representa el cien por ciento de los casos. El ancho izquierdo corresponde a nuestra creencia previa.',
            sceneState: { mode: 'bayes', prior: 0.15, sensitivity: 0.9, falsePos: 0.08 }
          },
          {
            t: 11,
            title: 'Verdaderos vs. falsos positivos',
            caption: 'La evidencia recorta solo las subáreas que activan la prueba.',
            equation: 'P(E) = P(H)P(E\\mid H) + P(\\neg H)P(E\\mid \\neg H)',
            mood: 'excited',
            speechText: 'Cuando aparece evidencia, solo nos quedamos con las áreas que activaron la alerta, comparando verdaderos positivos frente a falsas alarmas.',
            sceneState: { mode: 'bayes', prior: 0.1, sensitivity: 0.94, falsePos: 0.1 }
          }
        ],
        quiz: {
          question: 'Si la probabilidad previa P(H) es muy baja (1%) y hay 8% de falsos positivos, ¿qué ocurre con P(H|E)?',
          options: [
            'Sigue siendo moderada o baja porque las falsas alarmas superan en área a los aciertos',
            'Siempre sube automáticamente al 99%',
            'No depende de la probabilidad previa P(H)',
            'Se vuelve exactamente igual a la sensibilidad'
          ],
          correctIndex: 0,
          explanation: 'Cuando un evento es raro, incluso una tasa pequeña de falsos positivos sobre el 99% restante genera muchas alertas falsas.'
        }
      }
    ]
  },
  {
    id: 'finanzas-cuantitativas-vpn',
    slug: 'finanzas-cuantitativas-vpn',
    topic: 'Interés compuesto, valor del dinero en el tiempo y VPN',
    title: 'Finanzas Cuantitativas, Interés Compuesto y VPN',
    subtitle: 'Visualiza el contraste entre crecimiento lineal y exponencial al proyectar capital.',
    programSlug: 'maestria-en-administracion-de-empresas',
    level: 'Ejecutivo',
    voiceId: 'ef_dora',
    source: 'curated',
    renderer: 'compound_growth',
    lessons: [
      {
        id: 'fin-l1-compuesto',
        title: 'La geometría del interés compuesto',
        summary: 'El rendimiento sobre rendimientos previos abre una brecha exponencial frente al crecimiento lineal.',
        renderer: 'compound_growth',
        equation: 'V_t = C_0\\,(1 + r)^t',
        explorePrompt: 'Aumenta los años t de 5 a 25 y observa cómo la brecha sombreada acelera al final del horizonte.',
        params: [
          { id: 'capital', label: 'Capital inicial', min: 1000, max: 50000, step: 500, default: 10000, unit: 'USD' },
          { id: 'rate', label: 'Tasa anual', min: 1, max: 25, step: 0.5, default: 12, unit: '%' },
          { id: 'years', label: 'Horizonte', min: 1, max: 25, step: 1, default: 15, unit: 'años' }
        ],
        beats: [
          {
            t: 0,
            title: 'Lineal vs. exponencial',
            caption: 'Al inicio parecen cercanos, pero la curvatura domina con el tiempo.',
            equation: 'V_t = C_0(1+r)^t',
            mood: 'curious',
            speechText: 'Nuestro cerebro tiende a proyectar en línea recta, pero el capital compuesto reinvierte sus propios retornos en cada período.',
            sceneState: { capital: 10000, rate: 12, years: 15 }
          },
          {
            t: 11,
            title: 'El poder del horizonte',
            caption: 'Extender el plazo multiplica el diferencial acumulado.',
            equation: '\\Delta V = C_0\\left[(1+r)^t - (1 + r\\,t)\\right]',
            mood: 'emphatic',
            speechText: 'Cada año adicional añade más valor que el anterior. Esta misma lógica gobierna el valor presente neto en decisiones corporativas.',
            sceneState: { capital: 15000, rate: 14, years: 22 }
          }
        ],
        quiz: {
          question: '¿Por qué la diferencia entre interés compuesto y lineal crece tan rápido en años tardíos?',
          options: [
            'Porque la tasa se aplica cada año sobre el capital acumulado incluyendo intereses previos',
            'Porque el capital inicial cambia retroactivamente cada mes',
            'Porque la tasa nominal se divide entre el número de años',
            'Porque el crecimiento lineal crece al cuadrado'
          ],
          correctIndex: 0,
          explanation: 'El efecto multiplicativo aplica la tasa sobre una base cada vez mayor, generando una curva exponencial.'
        }
      }
    ]
  },
  {
    id: 'ciberseguridad-flujos-defensa',
    slug: 'ciberseguridad-flujos-defensa',
    topic: 'Ciberseguridad, criptografía y arquitectura Zero Trust',
    title: 'Ciberseguridad, Criptografía y Flujos de Defensa',
    subtitle: 'Simula paquetes de datos, defensa en profundidad, latencia y resiliencia operativa.',
    programSlug: 'maestria-en-ciberseguridad',
    level: 'Ejecutivo',
    voiceId: 'em_alex',
    source: 'curated',
    renderer: 'system_flow',
    lessons: [
      {
        id: 'sec-l1-flujo',
        title: 'Arquitectura Zero Trust y balance de latencia',
        summary: 'Observa cómo tráfico, controles de defensa y latencia interactúan a lo largo de una tubería de red.',
        renderer: 'system_flow',
        equation: 'E_{\\text{resiliente}} = \\text{Flujo} \\times \\text{Defensa} - \\text{Latencia}',
        explorePrompt: 'Sube la carga de tráfico y ajusta la cobertura de defensa para evitar cuellos de botella.',
        params: [
          { id: 'throughput', label: 'Carga de tráfico', min: 10, max: 100, step: 5, default: 65, unit: '%' },
          { id: 'defense', label: 'Cobertura de defensa', min: 0, max: 100, step: 5, default: 80, unit: '%' },
          { id: 'latency', label: 'Latencia de inspección', min: 10, max: 250, step: 5, default: 45, unit: 'ms' }
        ],
        beats: [
          {
            t: 0,
            title: 'Flujo continuo de paquetes',
            caption: 'Cada nodo verifica identidad y cifrado antes de autorizar el paso.',
            equation: '\\text{Zero Trust: Verificar siempre}',
            mood: 'curious',
            speechText: 'En una arquitectura Zero Trust ningún paquete avanza por confianza implícita: cada segmento valida autenticación, cifrado y telemetría.',
            sceneState: { throughput: 65, defense: 80, latency: 45 }
          },
          {
            t: 11,
            title: 'Equilibrio entre seguridad y latencia',
            caption: 'La inspección profunda protege más, pero exige capacidad para no saturar colas.',
            equation: 'R = \\text{Cobertura} \\;/\\; \\text{Fricción}',
            mood: 'emphatic',
            speechText: 'El reto ejecutivo consiste en maximizar la cobertura defensiva manteniendo latencias estables para los servicios críticos.',
            sceneState: { throughput: 82, defense: 92, latency: 35 }
          }
        ],
        quiz: {
          question: '¿Cuál es el principio fundamental de una arquitectura Zero Trust?',
          options: [
            'Verificar de forma continua cada solicitud sin asumir confianza por ubicación de red',
            'Desactivar el cifrado dentro de la red corporativa interna',
            'Permitir todo el tráfico cuando la latencia supera 100 ms',
            'Confiar en una única contraseña perimetral'
          ],
          correctIndex: 0,
          explanation: 'Zero Trust exige autenticación, autorización y cifrado continuos en cada salto del flujo de datos.'
        }
      }
    ]
  }
];

const RENDERER_LABELS = {
  vector_space: 'Espacio vectorial',
  calculus_curve: 'Cálculo visual',
  neural_network: 'Red neuronal',
  probability_dist: 'Probabilidad y Bayes',
  compound_growth: 'Crecimiento compuesto',
  system_flow: 'Flujo de sistema',
  concept_map: 'Mapa de actores',
  timeline_arc: 'Línea de tiempo',
  tension_matrix: 'Matriz estratégica'
};

const state = {
  apiBase: DEFAULT_API_BASE,
  voicePhone: '+19124915544',
  programs: [],
  courses: [],
  galleryFilter: 'all',
  activeCourse: null,
  lessonIndex: 0,
  beatIndex: 0,
  voiceId: VOICE_PROFILES[0].id,
  speed: 1,
  isPlaying: false,
  isPaused: false,
  playToken: 0,
  quizAnswered: false,
  engine: null,
  avatar: null,
  sliderRefs: new Map()
};

const els = {
  apiStatusPill: document.getElementById('api-status-pill'),
  apiStatusText: document.getElementById('api-status-text'),
  creatorSection: document.getElementById('aula-creator-section'),
  studioSection: document.getElementById('aula-studio-section'),
  creatorForm: document.getElementById('creator-form'),
  creatorTopic: document.getElementById('creator-topic'),
  creatorProgram: document.getElementById('creator-program'),
  creatorLevel: document.getElementById('creator-level'),
  creatorVoice: document.getElementById('creator-voice'),
  creatorStatus: document.getElementById('creator-status'),
  creatorSubmit: document.getElementById('creator-submit'),
  courseGallery: document.getElementById('course-gallery'),
  backToGalleryBtn: document.getElementById('back-to-gallery-btn'),
  studioCourseTitle: document.getElementById('studio-course-title'),
  studioLessonTitle: document.getElementById('studio-lesson-title'),
  lessonPills: document.getElementById('lesson-pills'),
  kokoroStatusPill: document.getElementById('kokoro-status-pill'),
  kokoroStatusText: document.getElementById('kokoro-status-text'),
  kokoroProgressWrap: document.getElementById('kokoro-progress-wrap'),
  kokoroProgressBar: document.getElementById('kokoro-progress-bar'),
  kokoroProgressPct: document.getElementById('kokoro-progress-pct'),
  openAvatarModalBtn: document.getElementById('open-avatar-modal-btn'),
  studioProgramCta: document.getElementById('studio-program-cta'),
  canvas: document.getElementById('threeblue-canvas'),
  stageBeatBadge: document.getElementById('stage-beat-badge'),
  stageEquation: document.getElementById('stage-equation'),
  stageCaption: document.getElementById('stage-caption'),
  prevBeatBtn: document.getElementById('prev-beat-btn'),
  playPauseBtn: document.getElementById('play-pause-btn'),
  nextBeatBtn: document.getElementById('next-beat-btn'),
  beatPills: document.getElementById('beat-pills'),
  speedSelect: document.getElementById('speed-select'),
  paramsSliders: document.getElementById('params-sliders'),
  resetParamsBtn: document.getElementById('reset-params-btn'),
  avatarMount: document.getElementById('avatar-mount'),
  avatarSpeakingBadge: document.getElementById('avatar-speaking-badge'),
  avatarSpeakingLabel: document.getElementById('avatar-speaking-label'),
  avatarModelBadge: document.getElementById('avatar-model-badge'),
  studioVoiceSelect: document.getElementById('studio-voice-select'),
  prepareKokoroBtn: document.getElementById('prepare-kokoro-btn'),
  downloadWavBtn: document.getElementById('download-wav-btn'),
  explorePrompt: document.getElementById('explore-prompt'),
  lessonRendererTag: document.getElementById('lesson-renderer-tag'),
  lessonSummaryText: document.getElementById('lesson-summary-text'),
  quizQuestion: document.getElementById('quiz-question'),
  quizOptions: document.getElementById('quiz-options'),
  quizFeedback: document.getElementById('quiz-feedback'),
  nextLessonBtn: document.getElementById('next-lesson-btn'),
  avatarModal: document.getElementById('avatar-modal'),
  closeAvatarModalBtn: document.getElementById('close-avatar-modal-btn'),
  useBrunetteAvatarBtn: document.getElementById('use-brunette-avatar-btn'),
  useProceduralAvatarBtn: document.getElementById('use-procedural-avatar-btn'),
  customAvatarUrl: document.getElementById('custom-avatar-url'),
  applyAvatarUrlBtn: document.getElementById('apply-avatar-url-btn'),
  avatarModalStatus: document.getElementById('avatar-modal-status'),
  modalDownloadWavBtn: document.getElementById('modal-download-wav-btn'),
  modalDownloadJsonBtn: document.getElementById('modal-download-json-btn'),
  renderCliCmd: document.getElementById('render-cli-cmd'),
  copyCliCmdBtn: document.getElementById('copy-cli-cmd-btn')
};

function parseJsonScript(id, fallback) {
  const el = document.getElementById(id);
  if (!el || !el.textContent) return fallback;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return fallback;
  }
}

function sanitizeApiBase(candidate) {
  if (!candidate || typeof candidate !== 'string') return '';
  const trimmed = candidate.trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin + parsed.pathname.replace(/\/+$/, '');
    }
  } catch {
    return '';
  }
  return '';
}

async function resolveAppConfig() {
  const embedded = parseJsonScript('ucg-config', {});
  const params = new URLSearchParams(window.location.search);
  const apiOverride = sanitizeApiBase(params.get('api'));
  let fileCfg = {};
  for (const path of ['./config.json', '../config.json']) {
    try {
      const res = await fetch(path, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        fileCfg = await res.json();
        break;
      }
    } catch {
      // Optional config.json fallback
    }
  }
  const apiBase =
    apiOverride ||
    sanitizeApiBase(embedded.apiBase) ||
    sanitizeApiBase(fileCfg.apiBase) ||
    DEFAULT_API_BASE;
  const voicePhone = embedded.voicePhone || fileCfg.voicePhone || '+19124915544';
  return { apiBase, voicePhone };
}

function isMathExpression(expr) {
  const text = String(expr || '').trim();
  if (!text) return false;
  if (/\\(?:frac|vec|det|sigma|Delta|times|cdot|lim|sum|int|hat|text|begin|end|approx|le|ge|to|implies|mid|neg|partial|eta|Phi|alpha|beta|lambda)\b/.test(text)) {
    return true;
  }
  if (/[\\^_=]/.test(text)) return true;
  if (/\b[fPg]\([a-zA-Z0-9_,\s]+\)/.test(text)) return true;
  return false;
}

function renderLatex(expr, targetEl) {
  if (!targetEl) return;
  const cleanExpr = String(expr || '').trim();
  if (!cleanExpr) {
    targetEl.textContent = '';
    targetEl.classList.remove('is-concept-thesis');
    targetEl.hidden = true;
    return;
  }
  targetEl.hidden = false;

  if (!isMathExpression(cleanExpr)) {
    targetEl.classList.add('is-concept-thesis');
    targetEl.textContent = cleanExpr;
    return;
  }

  targetEl.classList.remove('is-concept-thesis');
  if (typeof window !== 'undefined' && window.katex && typeof window.katex.render === 'function') {
    try {
      window.katex.render(cleanExpr, targetEl, {
        throwOnError: false,
        displayMode: false
      });
      return;
    } catch {
      // Fallback below
    }
  }
  targetEl.textContent = cleanExpr;
}

function formatParamValue(val, def) {
  const num = Number(val);
  if (!Number.isFinite(num)) return String(val ?? '');
  if (def?.id === 'eraFocus') {
    return `Hito ${Math.round(num) + 1}`;
  }
  if (def?.unit === '$') {
    return `$${Math.round(num).toLocaleString('en-US')}`;
  }
  const step = Number(def?.step) || 0.1;
  const decimals = step < 1 ? Math.min(2, (String(step).split('.')[1] || '').length) : 0;
  const formatted = num.toFixed(decimals);
  return def?.unit ? `${formatted} ${def.unit}` : formatted;
}

function showCreatorStatus(msg, isError = false) {
  if (!els.creatorStatus) return;
  if (!msg) {
    els.creatorStatus.hidden = true;
    els.creatorStatus.textContent = '';
    els.creatorStatus.classList.remove('is-error');
    return;
  }
  els.creatorStatus.hidden = false;
  els.creatorStatus.textContent = msg;
  els.creatorStatus.classList.toggle('is-error', Boolean(isError));
}

function setApiStatus(mode, text) {
  if (!els.apiStatusPill || !els.apiStatusText) return;
  els.apiStatusPill.classList.remove('is-loading', 'is-ok', 'is-warn');
  els.apiStatusPill.classList.add(mode);
  els.apiStatusText.textContent = text;
}

function populateProgramSelect(programs) {
  if (!els.creatorProgram || !Array.isArray(programs) || !programs.length) return;
  const current = els.creatorProgram.value;
  els.creatorProgram.innerHTML = '';

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Clase abierta multidisciplinaria';
  els.creatorProgram.appendChild(defaultOpt);

  const sorted = [...programs].sort((a, b) => String(a.title).localeCompare(String(b.title), 'es'));
  for (const prog of sorted) {
    if (!prog || !prog.slug) continue;
    const opt = document.createElement('option');
    opt.value = prog.slug;
    opt.textContent = prog.area ? `${prog.title} (${prog.area})` : prog.title;
    els.creatorProgram.appendChild(opt);
  }
  if (current) els.creatorProgram.value = current;
}

function populateVoiceSelects() {
  for (const select of [els.creatorVoice, els.studioVoiceSelect]) {
    if (!select) continue;
    const prev = select.value;
    select.innerHTML = '';
    for (const voice of VOICE_PROFILES) {
      const opt = document.createElement('option');
      opt.value = voice.id;
      opt.textContent = voice.label;
      select.appendChild(opt);
    }
    if (prev && VOICE_PROFILES.some((v) => v.id === prev)) {
      select.value = prev;
    } else {
      select.value = state.voiceId;
    }
  }
}

function renderCourseGallery() {
  if (!els.courseGallery) return;
  els.courseGallery.innerHTML = '';

  const filtered = state.courses.filter((course) => {
    if (state.galleryFilter === 'curated') return course.source === 'curated';
    if (state.galleryFilter === 'generated') return course.source !== 'curated';
    return true;
  });

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'gallery-skeleton';
    empty.textContent =
      state.galleryFilter === 'generated'
        ? 'Aún no hay clases creadas con IA en esta sesión. Usa el generador de arriba para crear la primera.'
        : 'No hay cursos disponibles en esta categoría.';
    els.courseGallery.appendChild(empty);
    return;
  }

  for (const course of filtered) {
    const card = document.createElement('article');
    card.className = 'course-card';

    const top = document.createElement('div');
    const badges = document.createElement('div');
    badges.className = 'course-card-badges';

    const rendererBadge = document.createElement('span');
    rendererBadge.className = 'badge-renderer';
    rendererBadge.textContent = RENDERER_LABELS[course.renderer] || course.renderer || 'system_flow';
    badges.appendChild(rendererBadge);

    const sourceBadge = document.createElement('span');
    sourceBadge.className = 'badge-source';
    sourceBadge.textContent = course.source === 'curated' ? 'Curso insignia UCG' : 'Creado con IA';
    badges.appendChild(sourceBadge);

    const lessonsBadge = document.createElement('span');
    lessonsBadge.className = 'badge-lessons';
    const count = Array.isArray(course.lessons) ? course.lessons.length : 1;
    lessonsBadge.textContent = `${count} ${count === 1 ? 'lección' : 'lecciones'}`;
    badges.appendChild(lessonsBadge);

    const title = document.createElement('h3');
    title.textContent = course.title || course.topic;

    const sub = document.createElement('p');
    sub.className = 'course-card-sub';
    sub.textContent = course.subtitle || `Exploración interactiva de ${course.topic}`;

    top.appendChild(badges);
    top.appendChild(title);
    top.appendChild(sub);

    if (course.program && course.program.title) {
      const progLine = document.createElement('p');
      progLine.className = 'course-card-program';
      progLine.textContent = `Vinculado a: ${course.program.title}`;
      top.appendChild(progLine);
    } else if (course.programSlug) {
      const matched = state.programs.find((p) => p.slug === course.programSlug);
      if (matched) {
        const progLine = document.createElement('p');
        progLine.className = 'course-card-program';
        progLine.textContent = `Vinculado a: ${matched.title}`;
        top.appendChild(progLine);
      }
    }

    const footer = document.createElement('div');
    footer.className = 'course-card-footer';

    const topicSpan = document.createElement('span');
    topicSpan.className = 'course-card-topic';
    topicSpan.textContent = course.level || 'Intermedio';

    const enterBtn = document.createElement('button');
    enterBtn.type = 'button';
    enterBtn.className = 'btn btn-cyan-outline btn-sm';
    enterBtn.textContent = 'Entrar a clase →';
    enterBtn.addEventListener('click', () => enterCourse(course));

    footer.appendChild(topicSpan);
    footer.appendChild(enterBtn);

    card.appendChild(top);
    card.appendChild(footer);
    els.courseGallery.appendChild(card);
  }
}

function ensureStudioControllers() {
  if (!state.engine && els.canvas) {
    state.engine = createThreeBlueEngine(els.canvas, {
      onParamChange: (id, value) => {
        const ref = state.sliderRefs.get(id);
        if (!ref) return;
        ref.input.value = String(value);
        ref.readout.textContent = formatParamValue(value, ref.def);
      }
    });
  }

  if (!state.avatar && els.avatarMount) {
    state.avatar = createAvatarKokoroController(els.avatarMount, {
      onVoiceStatus: (status) => {
        if (els.kokoroStatusText) {
          if (status?.message) {
            els.kokoroStatusText.textContent = status.message;
          } else if (status?.state === 'loading') {
            els.kokoroStatusText.textContent = 'Preparando Kokoro-82M Español…';
          } else if (status?.state === 'ready') {
            els.kokoroStatusText.textContent = `Kokoro-82M Español (es-419) listo (${String(status.device || 'wasm').toUpperCase()})`;
          } else if (status?.state === 'error') {
            els.kokoroStatusText.textContent = 'Error al cargar Kokoro-82M Español. Puedes reintentar.';
          }
        }
        if (els.kokoroStatusPill) {
          els.kokoroStatusPill.classList.remove('is-idle', 'is-loading', 'is-ready', 'is-error');
          if (status?.state === 'ready') {
            els.kokoroStatusPill.classList.add('is-ready');
          } else if (status?.state === 'loading') {
            els.kokoroStatusPill.classList.add('is-loading');
          } else if (status?.state === 'error') {
            els.kokoroStatusPill.classList.add('is-error');
          } else {
            els.kokoroStatusPill.classList.add('is-idle');
          }
        }
        if (els.prepareKokoroBtn) {
          if (status?.state === 'ready') {
            els.prepareKokoroBtn.textContent = `✓ Kokoro-82M listo (${String(status.device || 'wasm').toUpperCase()})`;
            els.prepareKokoroBtn.disabled = true;
          } else if (status?.state === 'loading') {
            els.prepareKokoroBtn.textContent = 'Preparando Kokoro-82M Español…';
            els.prepareKokoroBtn.disabled = true;
          } else if (status?.state === 'error') {
            els.prepareKokoroBtn.textContent = 'Reintentar Kokoro-82M (WebGPU/WASM)';
            els.prepareKokoroBtn.disabled = false;
          } else {
            els.prepareKokoroBtn.textContent = 'Preparar Kokoro-82M (WebGPU/WASM)';
            els.prepareKokoroBtn.disabled = false;
          }
        }
        if (status?.state === 'ready' && !state.isPlaying) {
          const lesson = getActiveLesson();
          const currentBeat = Array.isArray(lesson?.beats) ? lesson.beats[state.beatIndex] : null;
          const text = currentBeat ? (currentBeat.speechText || currentBeat.caption || currentBeat.title || '') : '';
          if (text) {
            state.avatar?.prefetch?.(text, { voice: state.voiceId, speed: state.speed });
          }
        }
      },
      onProgress: (info) => {
        if (!els.kokoroProgressWrap || !els.kokoroProgressBar || !els.kokoroProgressPct) return;
        if (info?.status === 'ready') {
          els.kokoroProgressWrap.hidden = true;
          return;
        }
        els.kokoroProgressWrap.hidden = false;
        const pct = Math.max(0, Math.min(100, Math.round(Number(info?.progress) || 0)));
        els.kokoroProgressBar.style.width = `${pct}%`;
        els.kokoroProgressPct.textContent = `${pct}%`;
      },
      onSpeechStart: () => {
        if (els.avatarSpeakingBadge) els.avatarSpeakingBadge.classList.add('is-speaking');
        if (els.avatarSpeakingLabel) {
          els.avatarSpeakingLabel.textContent = 'Narrando · Kokoro-82M (es-419)';
        }
      },
      onSpeechEnd: () => {
        if (els.avatarSpeakingBadge) els.avatarSpeakingBadge.classList.remove('is-speaking');
        if (els.avatarSpeakingLabel) els.avatarSpeakingLabel.textContent = 'En espera';
      },
      onAvatarStatus: (status) => {
        if (els.avatarModelBadge) {
          if (status?.mode === 'glb') els.avatarModelBadge.textContent = 'TalkingHead GLB';
          else if (status?.mode === 'loading') els.avatarModelBadge.textContent = 'Cargando GLB…';
          else if (status?.mode === 'fallback-2d') els.avatarModelBadge.textContent = 'Instructor 2D';
          else els.avatarModelBadge.textContent = 'Busto 3D';
        }
        if (els.avatarModalStatus && status?.message) {
          els.avatarModalStatus.hidden = false;
          els.avatarModalStatus.textContent = status.message;
        }
      }
    });
    state.avatar.setVoice(state.voiceId);
  }
}

function getActiveLesson() {
  if (!state.activeCourse || !Array.isArray(state.activeCourse.lessons)) return null;
  return state.activeCourse.lessons[state.lessonIndex] || state.activeCourse.lessons[0] || null;
}

function updatePlayButtonUi() {
  if (!els.playPauseBtn) return;
  if (state.isPlaying && !state.isPaused) {
    els.playPauseBtn.textContent = '⏸ Pausar';
  } else if (state.isPlaying && state.isPaused) {
    els.playPauseBtn.textContent = '▶ Reanudar';
  } else {
    els.playPauseBtn.textContent = '▶ Reproducir lección';
  }
}

function stopPlayback() {
  state.playToken += 1;
  state.isPlaying = false;
  state.isPaused = false;
  if (state.avatar) state.avatar.stop({ silent: true });
  if (state.engine) state.engine.setPlaying(false);
  updatePlayButtonUi();
}

function renderParamsBar(lesson) {
  if (!els.paramsSliders) return;
  els.paramsSliders.innerHTML = '';
  state.sliderRefs.clear();

  const params = Array.isArray(lesson?.params) ? lesson.params : [];
  if (!params.length) {
    const note = document.createElement('p');
    note.className = 'lesson-summary-text';
    note.textContent = 'Esta lección no requiere parámetros ajustables.';
    els.paramsSliders.appendChild(note);
    return;
  }

  const engineParams = state.engine ? state.engine.getParams() : {};
  for (const def of params) {
    const card = document.createElement('div');
    card.className = 'param-slider-card';

    const head = document.createElement('div');
    head.className = 'param-slider-head';

    const label = document.createElement('label');
    const inputId = `param-input-${def.id}`;
    label.setAttribute('for', inputId);
    label.textContent = def.label || def.id;

    const currentVal = Number.isFinite(engineParams[def.id]) ? engineParams[def.id] : def.default;
    const readout = document.createElement('span');
    readout.className = 'param-readout';
    readout.textContent = formatParamValue(currentVal, def);

    head.appendChild(label);
    head.appendChild(readout);

    const input = document.createElement('input');
    input.id = inputId;
    input.type = 'range';
    input.min = String(def.min ?? -10);
    input.max = String(def.max ?? 10);
    input.step = String(def.step ?? 0.1);
    input.value = String(currentVal);

    input.addEventListener('input', () => {
      const val = Number(input.value);
      readout.textContent = formatParamValue(val, def);
      if (state.engine) state.engine.setParam(def.id, val);
    });

    card.appendChild(head);
    card.appendChild(input);
    els.paramsSliders.appendChild(card);
    state.sliderRefs.set(def.id, { input, readout, def });
  }
}

function syncSlidersFromEngine() {
  if (!state.engine) return;
  const current = state.engine.getParams();
  for (const [id, ref] of state.sliderRefs.entries()) {
    if (Number.isFinite(current[id])) {
      ref.input.value = String(current[id]);
      ref.readout.textContent = formatParamValue(current[id], ref.def);
    }
  }
}

function renderQuiz(lesson) {
  if (!els.quizQuestion || !els.quizOptions || !els.quizFeedback) return;
  state.quizAnswered = false;
  els.quizOptions.innerHTML = '';
  els.quizFeedback.hidden = true;
  els.quizFeedback.classList.remove('is-correct', 'is-wrong');
  els.quizFeedback.textContent = '';

  const quiz = lesson?.quiz;
  if (!quiz) {
    els.quizQuestion.textContent = 'Explora los parámetros de esta lección para comprobar su comportamiento.';
    return;
  }

  els.quizQuestion.textContent = quiz.question;
  const options = Array.isArray(quiz.options) ? quiz.options : [];
  options.forEach((optText, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quiz-option-btn';
    btn.textContent = `${String.fromCharCode(65 + idx)}. ${optText}`;
    btn.addEventListener('click', () => {
      if (state.quizAnswered) return;
      state.quizAnswered = true;
      const isCorrect = idx === quiz.correctIndex;
      const allBtns = els.quizOptions.querySelectorAll('.quiz-option-btn');
      allBtns.forEach((b, bIdx) => {
        b.disabled = true;
        if (bIdx === quiz.correctIndex) b.classList.add('is-correct');
        else if (bIdx === idx && !isCorrect) b.classList.add('is-wrong');
      });
      els.quizFeedback.hidden = false;
      els.quizFeedback.classList.toggle('is-correct', isCorrect);
      els.quizFeedback.classList.toggle('is-wrong', !isCorrect);
      els.quizFeedback.textContent = isCorrect
        ? `✓ ¡Excelente! ${quiz.explanation || ''}`
        : `✗ Casi. ${quiz.explanation || ''}`;
    });
    els.quizOptions.appendChild(btn);
  });

  if (els.nextLessonBtn && state.activeCourse) {
    const hasNext = state.lessonIndex + 1 < state.activeCourse.lessons.length;
    els.nextLessonBtn.textContent = hasNext ? 'Siguiente lección →' : 'Volver a la Lección 1 ↺';
  }
}

function renderBeatPills(lesson) {
  if (!els.beatPills) return;
  els.beatPills.innerHTML = '';
  const beats = Array.isArray(lesson?.beats) ? lesson.beats : [];
  beats.forEach((beat, idx) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'beat-pill' + (idx === state.beatIndex ? ' is-active' : '');
    pill.textContent = `${idx + 1}. ${beat.title || `Escena ${idx + 1}`}`;
    pill.addEventListener('click', () => {
      const wasPlaying = state.isPlaying && !state.isPaused;
      stopPlayback();
      applyBeat(idx);
      if (wasPlaying) startPlaybackFrom(idx);
    });
    els.beatPills.appendChild(pill);
  });
}

function applyBeat(beatIdx) {
  const lesson = getActiveLesson();
  if (!lesson) return;
  const beats = Array.isArray(lesson.beats) ? lesson.beats : [];
  if (!beats.length) return;
  const clampedIdx = Math.max(0, Math.min(beats.length - 1, beatIdx));
  state.beatIndex = clampedIdx;
  const beat = beats[clampedIdx];

  if (els.stageBeatBadge) {
    els.stageBeatBadge.textContent = `Escena ${clampedIdx + 1} / ${beats.length} · ${beat.title || ''}`.trim();
  }
  renderLatex(beat.equation || lesson.equation, els.stageEquation);
  if (els.stageCaption) {
    els.stageCaption.textContent = beat.caption || beat.speechText || '';
  }

  if (els.beatPills) {
    els.beatPills.querySelectorAll('.beat-pill').forEach((node, idx) => {
      node.classList.toggle('is-active', idx === clampedIdx);
    });
  }

  if (state.engine) {
    state.engine.setBeat(beat, clampedIdx);
    syncSlidersFromEngine();
  }
  if (state.avatar) {
    state.avatar.setMood(beat.mood || 'neutral');
  }
}

async function startPlaybackFrom(startIdx) {
  const lesson = getActiveLesson();
  const beats = Array.isArray(lesson?.beats) ? lesson.beats : [];
  if (!beats.length) return;

  ensureStudioControllers();
  const token = ++state.playToken;
  state.isPlaying = true;
  state.isPaused = false;
  if (state.engine) state.engine.setPlaying(true);
  updatePlayButtonUi();

  for (let i = startIdx; i < beats.length; i += 1) {
    if (token !== state.playToken) return;
    applyBeat(i);
    const beat = beats[i];
    const nextBeat = beats[i + 1];
    if (nextBeat) {
      const nextText = nextBeat.speechText || nextBeat.caption || nextBeat.title || '';
      if (nextText) {
        state.avatar?.prefetch?.(nextText, {
          voice: state.voiceId,
          speed: state.speed
        });
      }
    }
    const speechText = beat.speechText || beat.caption || beat.title || '';
    if (state.avatar && speechText) {
      const res = await state.avatar.speak(speechText, {
        voice: state.voiceId,
        mood: beat.mood || 'neutral',
        speed: state.speed
      });
      if (token !== state.playToken || !res?.ok) {
        if (token === state.playToken && res && !res.cancelled && res.error && els.kokoroStatusText) {
          els.kokoroStatusText.textContent = String(res.error);
        }
        if (token === state.playToken) {
          state.isPlaying = false;
          state.isPaused = false;
          if (state.engine) state.engine.setPlaying(false);
          updatePlayButtonUi();
        }
        return;
      }
    }
  }

  if (token === state.playToken) {
    state.isPlaying = false;
    state.isPaused = false;
    if (state.engine) state.engine.setPlaying(false);
    updatePlayButtonUi();
  }
}

function loadLessonAt(lessonIdx) {
  if (!state.activeCourse || !Array.isArray(state.activeCourse.lessons)) return;
  const count = state.activeCourse.lessons.length;
  if (!count) return;
  stopPlayback();
  state.lessonIndex = Math.max(0, Math.min(count - 1, lessonIdx));
  const lesson = getActiveLesson();

  if (els.studioLessonTitle) els.studioLessonTitle.textContent = lesson.title || `Lección ${state.lessonIndex + 1}`;
  if (els.explorePrompt) els.explorePrompt.textContent = lesson.explorePrompt || '';
  if (els.lessonSummaryText) els.lessonSummaryText.textContent = lesson.summary || '';
  if (els.lessonRendererTag) {
    const rendererKey = lesson.renderer || 'system_flow';
    els.lessonRendererTag.textContent = RENDERER_LABELS[rendererKey] || rendererKey;
  }

  if (els.lessonPills) {
    els.lessonPills.querySelectorAll('.lesson-pill').forEach((btn, idx) => {
      btn.classList.toggle('is-active', idx === state.lessonIndex);
    });
  }

  ensureStudioControllers();
  if (state.engine) {
    state.engine.loadLesson(lesson);
  }
  renderParamsBar(lesson);
  renderBeatPills(lesson);
  applyBeat(0);
  renderQuiz(lesson);

  const firstBeat = Array.isArray(lesson.beats) ? lesson.beats[0] : null;
  const firstSpeech = firstBeat ? (firstBeat.speechText || firstBeat.caption || firstBeat.title || '') : '';
  if (firstSpeech) {
    state.avatar?.prefetch?.(firstSpeech, { voice: state.voiceId, speed: state.speed });
  }
}

function enterCourse(course) {
  if (!course) return;
  stopPlayback();
  state.activeCourse = course;

  if (course.voiceId && VOICE_PROFILES.some((v) => v.id === course.voiceId)) {
    state.voiceId = course.voiceId;
    if (els.studioVoiceSelect) els.studioVoiceSelect.value = state.voiceId;
    if (els.creatorVoice) els.creatorVoice.value = state.voiceId;
  }

  if (els.creatorSection) els.creatorSection.hidden = true;
  if (els.studioSection) els.studioSection.hidden = false;

  if (els.studioCourseTitle) els.studioCourseTitle.textContent = course.title || course.topic;
  if (els.studioProgramCta) {
    if (course.programSlug) {
      els.studioProgramCta.href = `../programas/${encodeURIComponent(course.programSlug)}/`;
      els.studioProgramCta.textContent = 'Ver Maestría UCG →';
    } else {
      els.studioProgramCta.href = '../#solicitar';
      els.studioProgramCta.textContent = 'Admisiones UCG';
    }
  }

  if (els.lessonPills) {
    els.lessonPills.innerHTML = '';
    const lessons = Array.isArray(course.lessons) ? course.lessons : [];
    lessons.forEach((lesson, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lesson-pill' + (idx === 0 ? ' is-active' : '');
      btn.textContent = `Lección ${idx + 1}`;
      btn.title = lesson.title || `Lección ${idx + 1}`;
      btn.addEventListener('click', () => loadLessonAt(idx));
      els.lessonPills.appendChild(btn);
    });
  }

  ensureStudioControllers();
  if (state.avatar) {
    state.avatar.init({ preloadKokoro: true });
    state.avatar.setVoice(state.voiceId);
  }
  if (state.engine) {
    window.requestAnimationFrame(() => state.engine?.resize());
  }

  if (course.slug && typeof window !== 'undefined' && window.history?.replaceState) {
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set('curso', course.slug);
    window.history.replaceState(null, '', shareUrl.toString());
  }

  loadLessonAt(0);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exitToGallery() {
  stopPlayback();
  if (els.studioSection) els.studioSection.hidden = true;
  if (els.creatorSection) els.creatorSection.hidden = false;
}

function buildQualitativeFallbackLesson(renderer, topic) {
  if (renderer === 'concept_map') {
    return {
      id: 'local-l1',
      title: `Actores y fuerzas clave en ${topic}`,
      summary: `Mapea las relaciones de cooperación, influencia y tensión que explican ${topic}.`,
      renderer: 'concept_map',
      equation: `${topic}: Cohesión ↔ Tensión estratégica entre actores`,
      explorePrompt: 'Ajusta cohesión, tensión e influencia externa o haz clic sobre un actor en el mapa.',
      params: [
        { id: 'cohesion', label: 'Cohesión / Alianzas', min: 0, max: 100, step: 5, default: 60, unit: '' },
        { id: 'tension', label: 'Tensión estratégica', min: 0, max: 100, step: 5, default: 45, unit: '' },
        { id: 'influence', label: 'Influencia externa', min: 0, max: 100, step: 5, default: 55, unit: '' }
      ],
      beats: [
        {
          t: 0,
          title: 'Mapa de actores',
          caption: `Identificamos los polos centrales que estructuran ${topic}.`,
          equation: `${topic}: Red de alianzas y contrapesos`,
          mood: 'curious',
          speechText: `Para comprender ${topic}, empezamos trazando los actores principales y cómo circulan las alianzas o tensiones entre ellos.`,
          sceneState: { cohesion: 60, tension: 45, influence: 55 }
        },
        {
          t: 11,
          title: 'Dinámica de presiones',
          caption: 'Cuando la influencia externa sube, las alianzas se reconfiguran.',
          equation: 'Equilibrio institucional frente a presiones externas',
          mood: 'emphatic',
          speechText: 'Al aumentar la tensión estratégica o la influencia externa, observa qué nodos concentran el peso de la decisión.',
          sceneState: { cohesion: 45, tension: 75, influence: 75 }
        }
      ],
      quiz: {
        question: `¿Por qué conviene analizar ${topic} como un sistema de actores y fuerzas?`,
        options: [
          'Porque permite anticipar efectos indirectos, alianzas y puntos de tensión entre actores',
          'Porque reduce cualquier fenómeno social a una única constante fija',
          'Porque elimina la influencia del contexto institucional',
          'Porque evita comparar perspectivas distintas'
        ],
        correctIndex: 0,
        explanation: 'Un mapa de actores revela cómo la cohesión interna y la presión externa modifican las decisiones colectivas.'
      }
    };
  }

  if (renderer === 'timeline_arc') {
    return {
      id: 'local-l1',
      title: `Evolución e hitos de ${topic}`,
      summary: `Recorre las etapas decisivas que moldearon ${topic} y proyecta su trayectoria futura.`,
      renderer: 'timeline_arc',
      equation: `${topic}: Continuidad histórica → Puntos de inflexión`,
      explorePrompt: 'Desliza el hito histórico o ajusta el impulso de cambio para evaluar la trayectoria.',
      params: [
        { id: 'eraFocus', label: 'Hito histórico', min: 0, max: 4, step: 1, default: 0, unit: '' },
        { id: 'momentum', label: 'Impulso de cambio', min: 0, max: 100, step: 5, default: 65, unit: '' },
        { id: 'continuity', label: 'Estabilidad institucional', min: 0, max: 100, step: 5, default: 55, unit: '' }
      ],
      beats: [
        {
          t: 0,
          title: 'Raíces históricas',
          caption: `Todo proceso en ${topic} responde a equilibrios previos e hitos fundacionales.`,
          equation: 'Memoria institucional como punto de partida',
          mood: 'curious',
          speechText: `Comenzamos el recorrido de ${topic} observando los hitos tempranos que fijaron las reglas del debate actual.`,
          sceneState: { eraFocus: 0, momentum: 60, continuity: 65 }
        },
        {
          t: 11,
          title: 'Punto de inflexión',
          caption: 'El impulso de cambio y la estabilidad definen los escenarios venideros.',
          equation: 'Trayectoria futura = Impulso de cambio vs. Estabilidad',
          mood: 'excited',
          speechText: 'Al avanzar por los hitos siguientes, observa cómo interactúan el impulso reformador y la continuidad institucional.',
          sceneState: { eraFocus: 3, momentum: 78, continuity: 50 }
        }
      ],
      quiz: {
        question: `¿Qué aporta analizar los puntos de inflexión históricos en ${topic}?`,
        options: [
          'Explica qué factores aceleran cambios estructurales y cuáles sostienen continuidad',
          'Demuestra que la historia se repite sin intervención de actores',
          'Impide proyectar escenarios futuros',
          'Sustituye la evidencia documental'
        ],
        correctIndex: 0,
        explanation: 'Comparar hitos revela cómo se combinan el impulso de cambio y la estabilidad institucional.'
      }
    };
  }

  return {
    id: 'local-l1',
    title: `Matriz estratégica de ${topic}`,
    summary: `Evalúa dilemas y compensaciones entre ejes clave en ${topic}.`,
    renderer: 'tension_matrix',
    equation: `${topic}: Equilibrio estratégico entre prioridades en competencia`,
    explorePrompt: 'Arrastra el marcador estratégico en los cuadrantes o ajusta los ejes X/Y y la presión del entorno.',
    params: [
      { id: 'axisX', label: 'Eje estratégico X', min: 0, max: 100, step: 5, default: 55, unit: '' },
      { id: 'axisY', label: 'Eje estratégico Y', min: 0, max: 100, step: 5, default: 60, unit: '' },
      { id: 'volatility', label: 'Presión del entorno', min: 0, max: 100, step: 5, default: 40, unit: '' }
    ],
    beats: [
      {
        t: 0,
        title: 'Cuadrantes de decisión',
        caption: `Ubicamos actores y posturas de ${topic} frente a dos ejes en tensión.`,
        equation: 'Dilema estratégico: Prioridad X frente a Prioridad Y',
        mood: 'curious',
        speechText: `En ${topic}, las decisiones rara vez son absolutas: requieren equilibrar dos objetivos que compiten en una matriz de cuadrantes.`,
        sceneState: { axisX: 55, axisY: 60, volatility: 40 }
      },
      {
        t: 11,
        title: 'Presión del entorno',
        caption: 'Mayor incertidumbre amplía el margen de riesgo alrededor de la postura elegida.',
        equation: 'Posicionamiento robusto bajo incertidumbre',
        mood: 'emphatic',
        speechText: 'Al aumentar la presión del entorno, observa cómo crece el halo de incertidumbre y exige estrategias más adaptables.',
        sceneState: { axisX: 72, axisY: 68, volatility: 70 }
      }
    ],
    quiz: {
      question: `¿Para qué sirve una matriz de tensión estratégica en ${topic}?`,
      options: [
        'Para comparar opciones reales equilibrando dos criterios en competencia y el riesgo del entorno',
        'Para eliminar todas las compensaciones de una decisión',
        'Para reemplazar el criterio directivo por una fórmula única',
        'Para ignorar la volatilidad del contexto'
      ],
      correctIndex: 0,
      explanation: 'La matriz visualiza compensaciones entre ejes y muestra qué tan sensible es cada posición ante cambios del entorno.'
    }
  };
}

function buildLocalFallbackCourse({ topic, programSlug, level, voiceId }) {
  const prog = state.programs.find((p) => p.slug === programSlug) || null;
  const t = String(topic || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  let renderer = 'system_flow';
  if (/algebra|matriz|vector|eigen/.test(t)) renderer = 'vector_space';
  else if (/calculo|derivada|integral|gradiente/.test(t)) renderer = 'calculus_curve';
  else if (/red|neuronal|deep|backprop/.test(t)) renderer = 'neural_network';
  else if (/bayes|probabil|estadist|gauss/.test(t)) renderer = 'probability_dist';
  else if (/finanz|vpn|interes|capital/.test(t)) renderer = 'compound_growth';
  else if (/historia|evolucion|cronologia|siglo|decada|origen|reforma/.test(t)) renderer = 'timeline_arc';
  else if (/tension|dilema|equilibrio|tradeoff|cuadrante|estrategia/.test(t)) renderer = 'tension_matrix';
  else if (/geopolitica|america latina|latam|relaciones internacionales|diplomacia|politica|derecho|constitucional|juridico|comunicacion|periodismo|liderazgo|cultura|etica|filosofia|sociologia|gobernanza|educacion|pedagogia/.test(t)) {
    renderer = 'concept_map';
  } else if (/\bia\b|inteligencia artificial|generativa/.test(t)) {
    renderer = 'neural_network';
  }

  let fallbackLesson;
  if (renderer === 'concept_map' || renderer === 'timeline_arc' || renderer === 'tension_matrix') {
    fallbackLesson = buildQualitativeFallbackLesson(renderer, topic);
  } else {
    const baseCourse =
      OFFLINE_CURATED_COURSES.find((c) => c.renderer === renderer) || OFFLINE_CURATED_COURSES[5];
    fallbackLesson = {
      ...baseCourse.lessons[0],
      id: 'local-l1',
      title: `Intuición visual de ${topic}`,
      summary: `Explora los principios fundamentales de ${topic} manipulando el modelo interactivo.`
    };
  }

  return {
    id: `local-${Date.now().toString(36)}`,
    slug: `local-${Date.now().toString(36)}`,
    topic,
    title: prog ? `${topic} · ${prog.shortTitle || prog.title}` : topic,
    subtitle: `Clase visual interactiva generada en modo local sobre ${topic}.`,
    programSlug: prog?.slug || null,
    program: prog,
    level,
    voiceId,
    source: 'template',
    renderer,
    lessons: [fallbackLesson]
  };
}

async function loadInitialData() {
  const inlinePrograms = parseJsonScript('catalog-data', []);
  if (Array.isArray(inlinePrograms) && inlinePrograms.length) {
    state.programs = inlinePrograms;
    populateProgramSelect(state.programs);
  } else {
    try {
      const catRes = await fetch('../catalog.json', { headers: { Accept: 'application/json' } });
      if (catRes.ok) {
        const catData = await catRes.json();
        if (Array.isArray(catData)) {
          state.programs = catData;
          populateProgramSelect(state.programs);
        }
      }
    } catch {
      // Optional catalog.json fallback
    }
  }

  try {
    const res = await fetch(`${state.apiBase}/api/public/courses`, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.programs) && data.programs.length && !state.programs.length) {
      state.programs = data.programs;
      populateProgramSelect(state.programs);
    }
    state.courses = Array.isArray(data.courses) && data.courses.length
      ? data.courses
      : OFFLINE_CURATED_COURSES;
    setApiStatus('is-ok', 'Estudio IA conectado');
  } catch {
    state.courses = OFFLINE_CURATED_COURSES;
    setApiStatus('is-warn', 'Modo local interactivo');
  }

  renderCourseGallery();
}

async function handleQueryHooks() {
  const params = new URLSearchParams(window.location.search);
  const cursoId = (params.get('curso') || '').trim();
  const programaSlug = (params.get('programa') || '').trim();
  const tema = (params.get('tema') || '').trim();

  if (tema && els.creatorTopic) {
    els.creatorTopic.value = tema;
    document.querySelectorAll('.topic-pill').forEach((pill) => {
      pill.classList.toggle('is-selected', pill.dataset.topic?.toLowerCase() === tema.toLowerCase());
    });
  }

  if (programaSlug && els.creatorProgram) {
    els.creatorProgram.value = programaSlug;
  }

  if (cursoId) {
    let target = state.courses.find((c) => c.id === cursoId || c.slug === cursoId) || null;
    if (!target) {
      try {
        const res = await fetch(`${state.apiBase}/api/public/courses/${encodeURIComponent(cursoId)}`, {
          headers: { Accept: 'application/json' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.course) target = data.course;
        }
      } catch {
        // Ignore network failure
      }
    }
    if (target) {
      enterCourse(target);
      return;
    }
  }

  if (programaSlug) {
    const linkedCourse = state.courses.find((c) => c.programSlug === programaSlug);
    if (linkedCourse) {
      enterCourse(linkedCourse);
      return;
    }
    const prog = state.programs.find((p) => p.slug === programaSlug);
    if (prog && els.creatorTopic && !els.creatorTopic.value.trim()) {
      els.creatorTopic.value = `Fundamentos de ${prog.shortTitle || prog.title}`;
      showCreatorStatus(
        `Maestría seleccionada: ${prog.title}. Presiona «Crear curso interactivo ahora» para generar tu clase personalizada.`
      );
    }
  }
}

function downloadCourseJsonBundle() {
  const course = state.activeCourse;
  const lesson = getActiveLesson();
  if (!course || !lesson) return;

  const beats = Array.isArray(lesson.beats) ? lesson.beats : [];
  const bundle = {
    ...course,
    exportedAt: new Date().toISOString(),
    activeLessonIndex: state.lessonIndex,
    timeline: beats.map((b, idx) => ({
      index: idx,
      t: b.t ?? idx * 10,
      title: b.title || '',
      mood: b.mood || 'neutral',
      equation: b.equation || lesson.equation || '',
      sceneState: b.sceneState || {}
    })),
    captions: beats.map((b, idx) => ({
      t: b.t ?? idx * 10,
      caption: b.caption || ''
    })),
    script: beats.map((b) => b.speechText || b.caption || '').join('\n\n')
  };

  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${course.slug || 'curso-ucg'}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);

  if (els.avatarModalStatus) {
    els.avatarModalStatus.hidden = false;
    els.avatarModalStatus.textContent = `Guion JSON descargado (${course.slug || 'curso-ucg'}.json).`;
  }
}

function triggerWavDownload() {
  ensureStudioControllers();
  const course = state.activeCourse;
  const lesson = getActiveLesson();
  const filename = `${course?.slug || 'leccion'}-l${state.lessonIndex + 1}.wav`;
  const result = state.avatar ? state.avatar.downloadLastWav(filename) : null;
  if (!result) {
    const msg = 'Primero prepara Kokoro-82M y reproduce al menos una escena para generar el audio WAV neuronal.';
    if (els.kokoroStatusText) els.kokoroStatusText.textContent = msg;
    if (els.avatarModalStatus) {
      els.avatarModalStatus.hidden = false;
      els.avatarModalStatus.textContent = msg;
    }
    return;
  }
  const okMsg = `Audio Kokoro WAV descargado (${result.filename}, ${result.durationSec.toFixed(1)}s).`;
  if (els.avatarModalStatus) {
    els.avatarModalStatus.hidden = false;
    els.avatarModalStatus.textContent = okMsg;
  }
  if (lesson && els.kokoroStatusText) {
    els.kokoroStatusText.textContent = okMsg;
  }
}

function bindEvents() {
  document.querySelectorAll('.topic-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      const topic = pill.dataset.topic || '';
      if (els.creatorTopic) els.creatorTopic.value = topic;
      document.querySelectorAll('.topic-pill').forEach((p) => p.classList.toggle('is-selected', p === pill));
    });
  });

  document.querySelectorAll('[data-gallery-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.galleryFilter = chip.dataset.galleryFilter || 'all';
      document.querySelectorAll('[data-gallery-filter]').forEach((c) => {
        c.classList.toggle('is-active', c === chip);
      });
      renderCourseGallery();
    });
  });

  if (els.creatorForm) {
    els.creatorForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const topic = (els.creatorTopic?.value || '').trim();
      if (topic.length < 3) {
        showCreatorStatus('Escribe un tema de al menos 3 caracteres para diseñar la clase.', true);
        els.creatorTopic?.focus();
        return;
      }

      const programSlug = els.creatorProgram?.value || '';
      const level = els.creatorLevel?.value || 'Intermedio';
      const voiceId = els.creatorVoice?.value || VOICE_PROFILES[0].id;

      if (els.creatorSubmit) els.creatorSubmit.disabled = true;
      showCreatorStatus('✨ Diseñando lecciones visuales, ecuaciones LaTeX y narración en español…');

      let createdCourse = null;
      try {
        const res = await fetch(`${state.apiBase}/api/public/courses/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ topic, programSlug: programSlug || null, level, lessonCount: 3, voiceId })
        });
        const data = await res.json();
        if (!res.ok || !data?.course) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        createdCourse = data.course;
        showCreatorStatus('');
      } catch (err) {
        console.warn('No se pudo generar el curso en el servidor; usando modo local:', err);
        createdCourse = buildLocalFallbackCourse({ topic, programSlug: programSlug || null, level, voiceId });
        showCreatorStatus('Generado en modo local interactivo (sin conexión al servidor).');
      } finally {
        if (els.creatorSubmit) els.creatorSubmit.disabled = false;
      }

      if (createdCourse) {
        state.courses = [createdCourse, ...state.courses.filter((c) => c.id !== createdCourse.id)];
        renderCourseGallery();
        enterCourse(createdCourse);
      }
    });
  }

  if (els.backToGalleryBtn) {
    els.backToGalleryBtn.addEventListener('click', exitToGallery);
  }

  if (els.playPauseBtn) {
    els.playPauseBtn.addEventListener('click', () => {
      if (state.isPlaying && !state.isPaused) {
        state.isPaused = true;
        if (state.avatar) state.avatar.pause();
        if (state.engine) state.engine.setPlaying(false);
        updatePlayButtonUi();
        return;
      }
      if (state.isPlaying && state.isPaused) {
        state.isPaused = false;
        if (state.avatar) state.avatar.resume();
        if (state.engine) state.engine.setPlaying(true);
        updatePlayButtonUi();
        return;
      }
      startPlaybackFrom(state.beatIndex);
    });
  }

  if (els.prevBeatBtn) {
    els.prevBeatBtn.addEventListener('click', () => {
      const lesson = getActiveLesson();
      const total = Array.isArray(lesson?.beats) ? lesson.beats.length : 0;
      if (!total) return;
      const target = Math.max(0, state.beatIndex - 1);
      const wasPlaying = state.isPlaying && !state.isPaused;
      stopPlayback();
      applyBeat(target);
      if (wasPlaying) startPlaybackFrom(target);
    });
  }

  if (els.nextBeatBtn) {
    els.nextBeatBtn.addEventListener('click', () => {
      const lesson = getActiveLesson();
      const total = Array.isArray(lesson?.beats) ? lesson.beats.length : 0;
      if (!total) return;
      const target = Math.min(total - 1, state.beatIndex + 1);
      const wasPlaying = state.isPlaying && !state.isPaused;
      stopPlayback();
      applyBeat(target);
      if (wasPlaying) startPlaybackFrom(target);
    });
  }

  if (els.speedSelect) {
    els.speedSelect.addEventListener('change', () => {
      const val = Number(els.speedSelect.value);
      state.speed = Number.isFinite(val) && val > 0 ? val : 1;
    });
  }

  if (els.resetParamsBtn) {
    els.resetParamsBtn.addEventListener('click', () => {
      const lesson = getActiveLesson();
      if (!lesson || !Array.isArray(lesson.params) || !state.engine) return;
      for (const def of lesson.params) {
        state.engine.setParam(def.id, def.default);
      }
      syncSlidersFromEngine();
    });
  }

  if (els.studioVoiceSelect) {
    els.studioVoiceSelect.addEventListener('change', () => {
      state.voiceId = els.studioVoiceSelect.value;
      if (els.creatorVoice) els.creatorVoice.value = state.voiceId;
      if (state.avatar) state.avatar.setVoice(state.voiceId);
    });
  }

  if (els.prepareKokoroBtn) {
    els.prepareKokoroBtn.addEventListener('click', () => {
      ensureStudioControllers();
      if (state.avatar) {
        state.avatar.init({ preloadKokoro: true, avatarUrl: null });
      }
    });
  }

  if (els.downloadWavBtn) {
    els.downloadWavBtn.addEventListener('click', triggerWavDownload);
  }

  if (els.nextLessonBtn) {
    els.nextLessonBtn.addEventListener('click', () => {
      if (!state.activeCourse || !Array.isArray(state.activeCourse.lessons)) return;
      const next = (state.lessonIndex + 1) % state.activeCourse.lessons.length;
      loadLessonAt(next);
    });
  }

  // Modal bindings
  if (els.openAvatarModalBtn && els.avatarModal) {
    els.openAvatarModalBtn.addEventListener('click', () => {
      els.avatarModal.hidden = false;
      if (els.customAvatarUrl && !els.customAvatarUrl.value) {
        els.customAvatarUrl.value = DEFAULT_AVATAR_URL;
      }
    });
  }

  if (els.closeAvatarModalBtn && els.avatarModal) {
    els.closeAvatarModalBtn.addEventListener('click', () => {
      els.avatarModal.hidden = true;
    });
  }

  if (els.avatarModal) {
    els.avatarModal.addEventListener('click', (event) => {
      if (event.target === els.avatarModal) els.avatarModal.hidden = true;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !els.avatarModal.hidden) {
        els.avatarModal.hidden = true;
      }
    });
  }

  if (els.useBrunetteAvatarBtn) {
    els.useBrunetteAvatarBtn.addEventListener('click', () => {
      ensureStudioControllers();
      state.avatar?.loadAvatarUrl(DEFAULT_AVATAR_URL);
    });
  }

  if (els.useProceduralAvatarBtn) {
    els.useProceduralAvatarBtn.addEventListener('click', () => {
      ensureStudioControllers();
      state.avatar?.loadAvatarUrl('procedural');
    });
  }

  if (els.applyAvatarUrlBtn) {
    els.applyAvatarUrlBtn.addEventListener('click', () => {
      const rawUrl = (els.customAvatarUrl?.value || '').trim();
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          throw new Error('Protocolo inválido');
        }
        ensureStudioControllers();
        state.avatar?.loadAvatarUrl(parsed.href);
      } catch {
        if (els.avatarModalStatus) {
          els.avatarModalStatus.hidden = false;
          els.avatarModalStatus.textContent = 'Ingresa una URL pública válida (https://.../avatar.glb).';
        }
      }
    });
  }

  if (els.modalDownloadWavBtn) {
    els.modalDownloadWavBtn.addEventListener('click', triggerWavDownload);
  }

  if (els.modalDownloadJsonBtn) {
    els.modalDownloadJsonBtn.addEventListener('click', downloadCourseJsonBundle);
  }

  if (els.copyCliCmdBtn && els.renderCliCmd) {
    els.copyCliCmdBtn.addEventListener('click', async () => {
      const text = els.renderCliCmd.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        els.copyCliCmdBtn.textContent = '✓ Copiado';
        window.setTimeout(() => {
          if (els.copyCliCmdBtn) els.copyCliCmdBtn.textContent = 'Copiar comando';
        }, 1600);
      } catch {
        if (els.avatarModalStatus) {
          els.avatarModalStatus.hidden = false;
          els.avatarModalStatus.textContent = 'Selecciona y copia el comando manualmente.';
        }
      }
    });
  }
}

async function init() {
  const cfg = await resolveAppConfig();
  state.apiBase = cfg.apiBase;
  state.voicePhone = cfg.voicePhone;

  populateVoiceSelects();
  bindEvents();
  await loadInitialData();
  await handleQueryHooks();
}

init();
