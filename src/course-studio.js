import { brand, programs } from './catalog.js';
import { activeAI, aiText, clean, normalized, redact } from './providers.js';

export const RENDERERS = [
  'vector_space',
  'calculus_curve',
  'neural_network',
  'probability_dist',
  'compound_growth',
  'system_flow',
];

const RENDERER_SET = new Set(RENDERERS);
const VALID_MOODS = new Set(['neutral', 'curious', 'excited', 'emphatic']);
const VALID_VOICES = new Set(['ef_dora', 'em_alex', 'em_santa']);
const VALID_LEVELS = new Set(['Introductorio', 'Intermedio', 'Avanzado', 'Ejecutivo']);

const CANONICAL_PARAMS = {
  vector_space: [
    { id: 'a', label: 'Componente îₓ (a)', min: -2.5, max: 2.5, step: 0.1, default: 1.5, unit: '' },
    { id: 'b', label: 'Componente ĵₓ (b)', min: -2.5, max: 2.5, step: 0.1, default: 0.6, unit: '' },
    { id: 'c', label: 'Componente îᵧ (c)', min: -2.5, max: 2.5, step: 0.1, default: -0.4, unit: '' },
    { id: 'd', label: 'Componente ĵᵧ (d)', min: -2.5, max: 2.5, step: 0.1, default: 1.2, unit: '' },
  ],
  calculus_curve: [
    { id: 'x0', label: 'Punto x₀', min: -2.5, max: 2.5, step: 0.1, default: 1.0, unit: '' },
    { id: 'h', label: 'Paso Δx (h)', min: 0.05, max: 2.0, step: 0.05, default: 0.8, unit: '' },
    { id: 'n', label: 'Particiones (n)', min: 2, max: 32, step: 1, default: 8, unit: '' },
  ],
  neural_network: [
    { id: 'w1', label: 'Peso w₁', min: -3.0, max: 3.0, step: 0.1, default: 1.6, unit: '' },
    { id: 'w2', label: 'Peso w₂', min: -3.0, max: 3.0, step: 0.1, default: -1.1, unit: '' },
    { id: 'bias', label: 'Sesgo (b)', min: -3.0, max: 3.0, step: 0.1, default: 0.2, unit: '' },
    { id: 'inputA', label: 'Entrada x₁', min: 0.0, max: 1.0, step: 0.05, default: 0.75, unit: '' },
  ],
  probability_dist: [
    { id: 'prior', label: 'Probabilidad previa P(H)', min: 0.01, max: 0.95, step: 0.01, default: 0.12, unit: '' },
    { id: 'sensitivity', label: 'Sensibilidad P(E|H)', min: 0.5, max: 0.99, step: 0.01, default: 0.92, unit: '' },
    { id: 'falsePos', label: 'Falso positivo P(E|¬H)', min: 0.01, max: 0.4, step: 0.01, default: 0.08, unit: '' },
  ],
  probability_dist_gaussian: [
    { id: 'mu', label: 'Media (μ)', min: -2.0, max: 2.0, step: 0.1, default: 0.0, unit: '' },
    { id: 'sigma', label: 'Desviación (σ)', min: 0.3, max: 2.0, step: 0.05, default: 0.85, unit: '' },
  ],
  compound_growth: [
    { id: 'capital', label: 'Capital inicial', min: 1000, max: 50000, step: 500, default: 10000, unit: 'USD' },
    { id: 'rate', label: 'Tasa anual', min: 1, max: 25, step: 0.5, default: 12, unit: '%' },
    { id: 'years', label: 'Horizonte', min: 1, max: 25, step: 1, default: 10, unit: 'años' },
  ],
  system_flow: [
    { id: 'throughput', label: 'Carga de tráfico', min: 10, max: 100, step: 5, default: 65, unit: '%' },
    { id: 'defense', label: 'Cobertura de defensa', min: 0, max: 100, step: 5, default: 80, unit: '%' },
    { id: 'latency', label: 'Latencia de inspección', min: 10, max: 250, step: 5, default: 45, unit: 'ms' },
  ],
};

function cloneParams(key) {
  return (CANONICAL_PARAMS[key] || CANONICAL_PARAMS.system_flow).map(p => ({ ...p }));
}

function summarizeProgram(programSlug) {
  if (!programSlug) return null;
  const p = programs.find(item => item.slug === programSlug);
  if (!p) return null;
  return {
    slug: p.slug,
    title: p.title,
    shortTitle: p.shortTitle,
    area: p.area,
    family: p.family || null,
    mode: p.mode || null,
    duration: p.duration || null,
    price: p.price ?? null,
    degree: p.degree || null,
    cesResolution: p.cesResolution || null,
    doubleDegree: p.doubleDegree || null,
    schedule: p.schedule || null,
    graduationMode: p.graduationMode || null,
    url: p.url,
    brochure: p.brochure || null,
    curriculum: Array.isArray(p.curriculum) ? p.curriculum.slice(0, 6) : [],
  };
}

export const CURATED_COURSES = [
  {
    id: 'algebra-lineal-visual',
    slug: 'algebra-lineal-visual',
    topic: 'Álgebra lineal, matrices y transformaciones geométricas',
    title: 'Esencia del Álgebra Lineal y Transformaciones',
    subtitle: 'Comprende matrices, determinantes y eigenvectores observando cómo el espacio completo se estira y rota en tiempo real.',
    programSlug: null,
    program: null,
    level: 'Introductorio',
    voiceId: 'ef_dora',
    source: 'curated',
    renderer: 'vector_space',
    createdAt: '2026-11-26T08:00:00.000Z',
    updatedAt: '2026-11-26T08:00:00.000Z',
    lessons: [
      {
        id: 'al-l1-vectores-base',
        title: 'Vectores base y el lenguaje de las matrices',
        summary: 'Una matriz de dos por dos no es una tabla fría de números: es la nueva dirección adonde aterrizan los vectores base î y ĵ.',
        renderer: 'vector_space',
        equation: 'T(\\vec{v}) = x\\,\\hat{i}_{\\text{nuevo}} + y\\,\\hat{j}_{\\text{nuevo}} = \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix} \\begin{bmatrix} x \\\\ y \\end{bmatrix}',
        explorePrompt: 'Arrastra las puntas de î y ĵ en el lienzo o mueve los deslizadores a, b, c y d hasta invertir la orientación del plano.',
        params: cloneParams('vector_space'),
        beats: [
          {
            t: 0,
            title: 'La cuadrícula como lienzo vivo',
            caption: 'Antes de multiplicar números, mira dónde viven todos los puntos del plano.',
            equation: '\\hat{i} = \\begin{bmatrix} 1 \\\\ 0 \\end{bmatrix}, \\quad \\hat{j} = \\begin{bmatrix} 0 \\\\ 1 \\end{bmatrix}',
            mood: 'curious',
            speechText: 'Cuando miras una matriz por primera vez, parece apenas una caja con cuatro números. Pero en el fondo, esa caja describe un movimiento completo del universo bidimensional: cada línea recta sigue siendo recta y el origen permanece fijo.',
            sceneState: { a: 1, b: 0, c: 0, d: 1, showDeterminant: false, showEigenvectors: false },
          },
          {
            t: 11,
            title: 'Solo necesitas seguir a î y ĵ',
            caption: 'La primera columna te dice adónde va î; la segunda columna te dice adónde va ĵ.',
            equation: 'A = \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix} \\implies T(\\hat{i}) = \\begin{bmatrix} a \\\\ c \\end{bmatrix}, \\; T(\\hat{j}) = \\begin{bmatrix} b \\\\ d \\end{bmatrix}',
            mood: 'excited',
            speechText: 'Aquí está la idea central: si sabes exactamente adónde aterrizan el vector verde î y el vector coral ĵ, sabes automáticamente adónde va cualquier otro vector del plano, porque la transformación respeta sumas y escalas.',
            sceneState: { a: 1.5, b: 0.5, c: 0.2, d: 1.3, showDeterminant: false, showEigenvectors: false },
          },
          {
            t: 22,
            title: 'Cizallamiento y rotación visual',
            caption: 'Cambiar b y c inclina o gira la cuadrícula entera sin romper el paralelismo.',
            equation: '\\vec{w} = 2\\,\\hat{i}_{\\text{nuevo}} - 1\\,\\hat{j}_{\\text{nuevo}}',
            mood: 'neutral',
            speechText: 'Observa cómo al inclinar ĵ hacia la derecha mediante el parámetro b, toda la malla se desliza como un mazo de naipes. Cada combinación lineal sigue intacta después de deformar el espacio.',
            sceneState: { a: 1.2, b: 1.1, c: -0.3, d: 0.9, showDeterminant: false, showEigenvectors: false },
          },
          {
            t: 33,
            title: 'Tu intuición geométrica manda',
            caption: 'Multiplicar matriz por vector equivale a combinar sus columnas.',
            equation: 'A\\vec{v} = x\\begin{bmatrix} a \\\\ c \\end{bmatrix} + y\\begin{bmatrix} b \\\\ d \\end{bmatrix}',
            mood: 'emphatic',
            speechText: 'Cada vez que veas una matriz multiplicando a un vector, lee sus columnas como los nuevos cimientos del espacio. Ahora prueba mover los controles para diseñar tu propia transformación.',
            sceneState: { a: 1.5, b: 0.6, c: -0.4, d: 1.2, showDeterminant: true, showEigenvectors: false },
          },
        ],
        quiz: {
          question: 'Si una transformación lineal envía î a [2, 1] y ĵ a [-1, 3], ¿cuál es su matriz asociada?',
          options: [
            'Primera columna [2, 1] y segunda columna [-1, 3]',
            'Primera fila [2, 1] y segunda fila [-1, 3]',
            'La suma de ambos vectores [1, 4]',
            'Depende únicamente del ángulo de ĵ',
          ],
          correctIndex: 0,
          explanation: 'Las columnas de una matriz de transformación registran exactamente las coordenadas finales de los vectores base î y ĵ.',
        },
      },
      {
        id: 'al-l2-determinante-area',
        title: 'El determinante como factor de escala de área',
        summary: 'Descubre por qué det(A) mide cuánto crece o colapsa cualquier región y qué significa un determinante negativo o nulo.',
        renderer: 'vector_space',
        equation: '\\det(A) = a\\cdot d - b\\cdot c = \\text{Área}(T(\\square))',
        explorePrompt: 'Ajusta a, b, c y d para hacer que î y ĵ queden colineales y observa el colapso cuando det(A) = 0.',
        params: [
          { id: 'a', label: 'Componente îₓ (a)', min: -2.5, max: 2.5, step: 0.1, default: 1.6, unit: '' },
          { id: 'b', label: 'Componente ĵₓ (b)', min: -2.5, max: 2.5, step: 0.1, default: 0.4, unit: '' },
          { id: 'c', label: 'Componente îᵧ (c)', min: -2.5, max: 2.5, step: 0.1, default: 0.2, unit: '' },
          { id: 'd', label: 'Componente ĵᵧ (d)', min: -2.5, max: 2.5, step: 0.1, default: 1.4, unit: '' },
        ],
        beats: [
          {
            t: 0,
            title: 'El cuadrado unitario como medidor universal',
            caption: 'Un cuadrado de área 1 se convierte en un paralelogramo cuya área es el determinante.',
            equation: '\\text{Área}_{\\text{inicial}} = 1 \\longrightarrow \\text{Área}_{\\text{final}} = |a d - b c|',
            mood: 'curious',
            speechText: 'Imagina un pequeño cuadrado de área uno formado entre î y ĵ. Cuando aplicamos cualquier transformación lineal, ese cuadrado se estira en un paralelogramo. Su nueva área es exactamente el determinante de la matriz.',
            sceneState: { a: 1.6, b: 0.4, c: 0.2, d: 1.4, showDeterminant: true, showEigenvectors: false },
          },
          {
            t: 12,
            title: 'Cuando el espacio se aplasta a una línea',
            caption: 'Si det(A) = 0, toda la dimensión bidimensional colapsa y la matriz no tiene inversa.',
            equation: '\\det(A) = 0 \\iff \\text{colapso dimensional (no invertible)}',
            mood: 'emphatic',
            speechText: 'Qué ocurre si alineamos î y ĵ sobre la misma recta? El paralelogramo pierde todo su espesor y su área cae a cero. Por eso una matriz con determinante cero destruye información y no puede revertirse.',
            sceneState: { a: 1.4, b: 0.7, c: 0.8, d: 0.4, showDeterminant: true, showEigenvectors: false },
          },
          {
            t: 24,
            title: 'Determinantes negativos: dar la vuelta al plano',
            caption: 'Un signo menos indica que el plano se volteó como una hoja al revés.',
            equation: '\\det\\begin{bmatrix} -1 & 0 \\\\ 0 & 1 \\end{bmatrix} = -1',
            mood: 'excited',
            speechText: 'Y qué sentido tiene un área negativa? Significa que invertimos la orientación del espacio: si antes ibas de î hacia ĵ en sentido antihorario, ahora giras en sentido horario, como reflejar el plano en un espejo.',
            sceneState: { a: -1.3, b: 0.3, c: 0.2, d: 1.2, showDeterminant: true, showEigenvectors: false },
          },
          {
            t: 36,
            title: 'Regla multiplicativa instantánea',
            caption: 'Encadenar dos transformaciones multiplica sus factores de área.',
            equation: '\\det(B \\cdot A) = \\det(B)\\cdot\\det(A)',
            mood: 'neutral',
            speechText: 'Si una primera transformación duplica las áreas y la segunda las triplica, el efecto combinado las multiplica por seis. Esa intuición explica en una sola frase por qué el determinante de un producto es el producto de determinantes.',
            sceneState: { a: 1.6, b: 0.4, c: 0.2, d: 1.4, showDeterminant: true, showEigenvectors: false },
          },
        ],
        quiz: {
          question: 'Si una matriz tiene determinante igual a -3, ¿qué le sucede a una figura de área 4?',
          options: [
            'Su área se vuelve 12 y cambia la orientación del plano',
            'Desaparece en una sola línea',
            'Se encoge a un tercio de su tamaño',
            'Rota exactamente 90 grados sin escalar',
          ],
          correctIndex: 0,
          explanation: 'El valor absoluto |det| = 3 multiplica el área (4 × 3 = 12) y el signo negativo refleja la orientación del espacio.',
        },
      },
      {
        id: 'al-l3-eigenvectores',
        title: 'Eigenvectores: ejes que no pierden su dirección',
        summary: 'Visualiza los vectores propios como las rectas privilegiadas que solo se estiran o encogen bajo una transformación.',
        renderer: 'vector_space',
        equation: 'A\\vec{v} = \\lambda\\vec{v}',
        explorePrompt: 'Modifica los parámetros para crear una matriz simétrica (b = c) y observa cómo emergen dos eigenvectores perpendiculares.',
        params: [
          { id: 'a', label: 'Componente îₓ (a)', min: -2.5, max: 2.5, step: 0.1, default: 1.7, unit: '' },
          { id: 'b', label: 'Componente ĵₓ (b)', min: -2.5, max: 2.5, step: 0.1, default: 0.5, unit: '' },
          { id: 'c', label: 'Componente îᵧ (c)', min: -2.5, max: 2.5, step: 0.1, default: 0.5, unit: '' },
          { id: 'd', label: 'Componente ĵᵧ (d)', min: -2.5, max: 2.5, step: 0.1, default: 1.1, unit: '' },
        ],
        beats: [
          {
            t: 0,
            title: 'Casi todos los vectores giran',
            caption: 'Al transformar el plano, la mayoría de flechas cambian tanto de longitud como de ángulo.',
            equation: 'A\\vec{u} \\nparallel \\vec{u}',
            mood: 'curious',
            speechText: 'Cuando una matriz deforma el plano, casi todas las flechas salen despedidas hacia ángulos distintos. Sin embargo, algunas direcciones especiales permanecen sobre su misma línea de acción.',
            sceneState: { a: 1.7, b: 0.5, c: 0.5, d: 1.1, showDeterminant: false, showEigenvectors: true },
          },
          {
            t: 11,
            title: 'La firma secreta del sistema',
            caption: 'Un eigenvector solo se escala por su eigenvalor λ sin desviarse de su recta.',
            equation: '\\det(A - \\lambda I) = 0 \\implies A\\vec{v} = \\lambda\\vec{v}',
            mood: 'excited',
            speechText: 'Esas direcciones invariantes se llaman eigenvectores o vectores propios. La matriz actúa sobre ellos como si fuera apenas un número sencillo llamado eigenvalor lambda: los estira, los encoge o los invierte sin sacarlos de su eje.',
            sceneState: { a: 1.9, b: 0.4, c: 0.4, d: 0.9, showDeterminant: true, showEigenvectors: true },
          },
          {
            t: 23,
            title: 'Por qué dominan la ciencia de datos',
            caption: 'En PCA y analítica, los eigenvectores señalan los ejes de máxima varianza.',
            equation: '\\Sigma\\,\\vec{v}_1 = \\lambda_1\\,\\vec{v}_1',
            mood: 'emphatic',
            speechText: 'Esta geometría sostiene el análisis de componentes principales, el algoritmo de PageRank y la estabilidad de redes. Encontrar la base propia convierte un problema acoplado en ejes independientes fáciles de interpretar.',
            sceneState: { a: 1.7, b: 0.5, c: 0.5, d: 1.1, showDeterminant: true, showEigenvectors: true },
          },
          {
            t: 35,
            title: 'Cuando desaparecen los ejes reales',
            caption: 'Una rotación pura no deja ninguna dirección real intacta en el plano.',
            equation: 'R(\\theta) = \\begin{bmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{bmatrix}',
            mood: 'neutral',
            speechText: 'Si giras el plano entero treinta grados, ningún vector real apunta en la misma dirección que antes; sus valores propios viven en el plano complejo. Prueba hacer b negativo y c positivo para verlo en vivo.',
            sceneState: { a: 0.8, b: -0.7, c: 0.7, d: 0.8, showDeterminant: true, showEigenvectors: true },
          },
        ],
        quiz: {
          question: '¿Qué propiedad define geométricamente a un eigenvector v de una matriz A?',
          options: [
            'Av permanece paralelo a la misma línea que v (solo se escala por λ)',
            'Siempre tiene longitud igual a 1 y ángulo de 45 grados',
            'Su determinante siempre vale cero',
            'Anula todos los sesgos de la matriz',
          ],
          correctIndex: 0,
          explanation: 'Un eigenvector conserva su dirección original tras la transformación; la matriz únicamente lo escala por el factor λ.',
        },
      },
    ],
  },
  {
    id: 'redes-neuronales-desde-cero',
    slug: 'redes-neuronales-desde-cero',
    topic: 'Redes neuronales, fronteras de decisión y backpropagation',
    title: 'Redes Neuronales y Backpropagation desde Cero',
    subtitle: 'Observa cómo pesos, sesgos y activaciones transforman señales crudas en decisiones inteligentes.',
    programSlug: 'maestria-en-ia-y-ciencia-de-datos',
    program: summarizeProgram('maestria-en-ia-y-ciencia-de-datos'),
    level: 'Intermedio',
    voiceId: 'em_alex',
    source: 'curated',
    renderer: 'neural_network',
    createdAt: '2026-11-26T08:05:00.000Z',
    updatedAt: '2026-11-26T08:05:00.000Z',
    lessons: [
      {
        id: 'rn-l1-perceptron',
        title: 'La neurona artificial y su frontera de decisión',
        summary: 'Cada neurona calcula una suma ponderada y dibuja una frontera recta que separa categorías en el plano de datos.',
        renderer: 'neural_network',
        equation: 'z = w_1 x_1 + w_2 x_2 + b, \\quad \\hat{y} = \\sigma(z) = \\frac{1}{1 + e^{-z}}',
        explorePrompt: 'Mueve w₁, w₂ y el sesgo b para girar y desplazar la frontera en el mapa de calor inferior.',
        params: cloneParams('neural_network'),
        beats: [
          {
            t: 0,
            title: 'De píxeles o métricas a evidencia numérica',
            caption: 'Cada conexión asigna importancia positiva (cian) o inhibitoria (coral) a una señal.',
            equation: 'z = \\sum_{i} w_i x_i + b',
            mood: 'curious',
            speechText: 'Una red neuronal profunda parece misteriosa, pero su bloque fundamental es sorprendentemente cercano: una neurona toma varias evidencias numéricas, multiplica cada una por un peso w y decide si la suma supera cierto umbral.',
            sceneState: { stage: 'forward', w1: 1.6, w2: -1.1, bias: 0.2, inputA: 0.75 },
          },
          {
            t: 11,
            title: 'El papel del sesgo (bias)',
            caption: 'El sesgo mueve la frontera sin cambiar su inclinación: controla cuán exigente es la neurona.',
            equation: 'w_1 x_1 + w_2 x_2 + b = 0',
            mood: 'excited',
            speechText: 'Mientras los pesos w uno y w dos determinan qué dirección importa más, el sesgo b actúa como el nivel de exigencia para encender la neurona. Si subes el sesgo, la región activa se expande por todo el mapa.',
            sceneState: { stage: 'boundary', w1: 1.8, w2: 1.2, bias: -0.9, inputA: 0.7 },
          },
          {
            t: 23,
            title: 'La función sigmoide suaviza la decisión',
            caption: 'En lugar de un salto brusco de 0 a 1, obtenemos una probabilidad continua y derivable.',
            equation: '\\sigma(z) \\in (0, 1)',
            mood: 'neutral',
            speechText: 'Para que la red pueda aprender paso a paso, necesitamos que los cambios pequeños en los pesos produzcan cambios pequeños en la salida. La función sigmoide comprime cualquier puntaje real en una probabilidad suave entre cero y uno.',
            sceneState: { stage: 'forward', w1: 1.6, w2: -1.1, bias: 0.2, inputA: 0.75 },
          },
          {
            t: 34,
            title: 'Conexión con la Maestría en IA UCG',
            caption: 'Estos fundamentos escalan hacia Deep Learning y arquitecturas modernas de clasificación.',
            equation: '\\mathcal{L} = -\\big[y\\log(\\hat{y}) + (1-y)\\log(1-\\hat{y})\\big]',
            mood: 'emphatic',
            speechText: 'En la Maestría en Inteligencia Artificial y Analítica de Datos de la Universidad Casa Grande se parte exactamente de esta intuición matemática antes de construir arquitecturas profundas sobre datos reales de negocio.',
            sceneState: { stage: 'loss', w1: 2.1, w2: -1.4, bias: 0.3, inputA: 0.85 },
          },
        ],
        quiz: {
          question: 'En una neurona artificial z = w₁x₁ + w₂x₂ + b, ¿qué efecto geométrico tiene modificar únicamente el sesgo b?',
          options: [
            'Desplaza paralelamente la frontera de decisión sin cambiar su pendiente',
            'Elimina la necesidad de función de activación',
            'Invierte los valores de entrada x₁ y x₂',
            'Duplica el número de capas ocultas',
          ],
          correctIndex: 0,
          explanation: 'Los pesos (w₁, w₂) fijan la orientación normal de la recta y el sesgo b la traslada paralelamente en el plano.',
        },
      },
      {
        id: 'rn-l2-capas-ocultas',
        title: 'Capas ocultas: doblar el espacio para separar lo no lineal',
        summary: 'Una sola recta falla ante patrones complejos; combinar múltiples neuronas ocultas construye regiones curvas.',
        renderer: 'neural_network',
        equation: '\\vec{h} = \\text{ReLU}(W^{(1)}\\vec{x} + \\vec{b}^{(1)}), \\quad \\hat{y} = \\sigma(W^{(2)}\\vec{h} + b^{(2)})',
        explorePrompt: 'Cambia la señal de entrada x₁ y observa cómo se propagan pulsos diferenciados por la capa oculta de 4 neuronas.',
        params: [
          { id: 'w1', label: 'Peso w₁', min: -3.0, max: 3.0, step: 0.1, default: 2.2, unit: '' },
          { id: 'w2', label: 'Peso w₂', min: -3.0, max: 3.0, step: 0.1, default: 1.5, unit: '' },
          { id: 'bias', label: 'Sesgo (b)', min: -3.0, max: 3.0, step: 0.1, default: -0.6, unit: '' },
          { id: 'inputA', label: 'Entrada x₁', min: 0.0, max: 1.0, step: 0.05, default: 0.6, unit: '' },
        ],
        beats: [
          {
            t: 0,
            title: 'El límite de una sola línea recta',
            caption: 'Problemas tipo XOR o detección de fraude requieren múltiples cortes coordinados.',
            equation: 'x_1 \\oplus x_2 \\neq \\text{linealmente separable}',
            mood: 'curious',
            speechText: 'Una neurona aislada solo sabe trazar una frontera plana. Si tus clientes o transacciones forman islas rodeadas de riesgo, ninguna recta única logrará separarlos con precisión.',
            sceneState: { stage: 'boundary', w1: 2.2, w2: 1.5, bias: -0.6, inputA: 0.6 },
          },
          {
            t: 12,
            title: 'Cada neurona oculta aporta un pliegue',
            caption: 'Cuatro neuronas intermedias actúan como cuatro detectores de rasgos complementarios.',
            equation: 'h_k = \\max(0,\\, w_{k1} x_1 + w_{k2} x_2 + b_k)',
            mood: 'excited',
            speechText: 'Al añadir una capa oculta, cada neurona aprende una frontera propia. La siguiente capa combina esas cuatro señales y logra recortar polígonos y regiones curvas en el espacio de atributos.',
            sceneState: { stage: 'forward', w1: -1.8, w2: 2.1, bias: 0.4, inputA: 0.8 },
          },
          {
            t: 24,
            title: 'Representaciones jerárquicas',
            caption: 'Las primeras capas captan bordes o razones simples; las profundas captan conceptos.',
            equation: '\\vec{x} \\xrightarrow{W^{(1)}} \\vec{h}^{(1)} \\xrightarrow{W^{(2)}} \\hat{y}',
            mood: 'neutral',
            speechText: 'Cada capa transforma los datos hacia un nuevo sistema de coordenadas donde las clases finalmente sí pueden separarse con claridad. Por eso hablamos de aprendizaje de representaciones.',
            sceneState: { stage: 'forward', w1: 2.2, w2: 1.5, bias: -0.6, inputA: 0.6 },
          },
          {
            t: 36,
            title: 'Equilibrio entre capacidad y generalización',
            caption: 'Más parámetros exigen regularización para no memorizar ruido.',
            equation: '\\min_{\\theta}\\; \\mathcal{L}(\\theta) + \\lambda\\|\\theta\\|_2^2',
            mood: 'emphatic',
            speechText: 'Tener demasiada flexibilidad sin control provoca sobreajuste: la red memoriza ejemplos pasados y falla mañana. Regularizar los pesos mantiene fronteras limpias y generalizables.',
            sceneState: { stage: 'loss', w1: 1.4, w2: -1.2, bias: 0.0, inputA: 0.5 },
          },
        ],
        quiz: {
          question: '¿Por qué son indispensables las funciones de activación no lineales (como ReLU o sigmoide) entre capas?',
          options: [
            'Sin no linealidad, apilar capas lineales colapsaría en una sola transformación lineal',
            'Para reducir la memoria RAM del navegador a la mitad',
            'Para eliminar todos los sesgos negativos durante la inferencia',
            'Porque los pesos no pueden multiplicarse por números decimales',
          ],
          correctIndex: 0,
          explanation: 'La composición de transformaciones lineales siempre es otra transformación lineal; la no linealidad permite doblar el espacio y aprender fronteras complejas.',
        },
      },
      {
        id: 'rn-l3-backpropagation',
        title: 'Backpropagation: el algoritmo que asigna crédito al error',
        summary: 'Entiende la regla de la cadena como una cascada de sensibilidad que ajusta cada peso según su culpa en el error final.',
        renderer: 'neural_network',
        equation: '\\frac{\\partial \\mathcal{L}}{\\partial w_{ij}} = \\frac{\\partial \\mathcal{L}}{\\partial \\hat{y}} \\cdot \\frac{\\partial \\hat{y}}{\\partial z} \\cdot \\frac{\\partial z}{\\partial w_{ij}}',
        explorePrompt: 'Observa los pesos negativos en coral y positivos en cian; experimenta ajustando w₁ y w₂ para equilibrar las probabilidades de salida.',
        params: [
          { id: 'w1', label: 'Peso w₁', min: -3.0, max: 3.0, step: 0.1, default: 1.3, unit: '' },
          { id: 'w2', label: 'Peso w₂', min: -3.0, max: 3.0, step: 0.1, default: -2.0, unit: '' },
          { id: 'bias', label: 'Sesgo (b)', min: -3.0, max: 3.0, step: 0.1, default: 0.5, unit: '' },
          { id: 'inputA', label: 'Entrada x₁', min: 0.0, max: 1.0, step: 0.05, default: 0.9, unit: '' },
        ],
        beats: [
          {
            t: 0,
            title: 'Del error hacia atrás',
            caption: 'Primero propagamos la entrada hacia adelante; luego medimos cuánto nos equivocamos.',
            equation: 'e = \\hat{y} - y_{\\text{real}}',
            mood: 'curious',
            speechText: 'Cuando la red predice mal un resultado, surge la gran pregunta: entre miles o millones de pesos, a cuál debemos culpar y en qué dirección moverlo? Aquí entra la retropropagación.',
            sceneState: { stage: 'loss', w1: 1.3, w2: -2.0, bias: 0.5, inputA: 0.9 },
          },
          {
            t: 12,
            title: 'La regla de la cadena en acción',
            caption: 'Cada neurona recibe el gradiente de salida y lo reparte proporcionalmente a sus pesos.',
            equation: '\\delta_j = \\Big(\\sum_k \\delta_k w_{kj}\\Big)\\,\\sigma\'(z_j)',
            mood: 'excited',
            speechText: 'La regla de la cadena calcula la sensibilidad del error respecto a cada parámetro en un solo recorrido hacia atrás. Si un peso estaba multiplicando una entrada muy activa, su responsabilidad es mayor y recibe un ajuste proporcional.',
            sceneState: { stage: 'backprop', w1: 2.1, w2: -1.2, bias: 0.2, inputA: 0.85 },
          },
          {
            t: 24,
            title: 'Pasos pequeños y constantes',
            caption: 'La tasa de aprendizaje η evita oscilar sobre el valle del error.',
            equation: 'w_{\\text{nuevo}} = w - \\eta\\,\\frac{\\partial \\mathcal{L}}{\\partial w}',
            mood: 'neutral',
            speechText: 'Con los gradientes listos, actualizamos cada peso dando un pequeño paso en dirección contraria al error. Repetido miles de veces sobre lotes de datos, el mapa de decisión se alinea con la realidad.',
            sceneState: { stage: 'forward', w1: 1.8, w2: -1.5, bias: 0.3, inputA: 0.8 },
          },
          {
            t: 36,
            title: 'De cero a sistemas en producción',
            caption: 'El mismo principio entrena desde clasificadores tabulares hasta modelos de lenguaje.',
            equation: '\\nabla_{\\theta}\\mathcal{L}(\\theta) \\longrightarrow \\text{convergencia}',
            mood: 'emphatic',
            speechText: 'Ya sea una red pequeña de cuatro neuronas o un gran modelo multimodal, el motor de aprendizaje es esta elegante propagación de derivadas parciales. Sigue explorando el grafo con los deslizadores.',
            sceneState: { stage: 'boundary', w1: 1.3, w2: -2.0, bias: 0.5, inputA: 0.9 },
          },
        ],
        quiz: {
          question: '¿Qué calcula exactamente el algoritmo de backpropagation durante el entrenamiento?',
          options: [
            'El gradiente de la función de pérdida respecto a cada peso y sesgo de la red',
            'El número óptimo de capas ocultas sin usar datos',
            'La compresión JPEG de las imágenes de entrada',
            'La inversión exacta de matrices cuadradas no lineales',
          ],
          correctIndex: 0,
          explanation: 'Backpropagation aplica la regla de la cadena de atrás hacia adelante para obtener ∂L/∂w de cada parámetro y guiar el descenso de gradiente.',
        },
      },
    ],
  },
  {
    id: 'calculo-visual-derivadas-gradientes',
    slug: 'calculo-visual-derivadas-gradientes',
    topic: 'Cálculo diferencial, integrales de Riemann y descenso de gradiente',
    title: 'Cálculo Visual: Derivadas, Integrales y Gradientes',
    subtitle: 'Visualiza el límite Δx → 0, el área acumulada bajo la curva y la física detrás de la optimización moderna.',
    programSlug: null,
    program: null,
    level: 'Introductorio',
    voiceId: 'ef_dora',
    source: 'curated',
    renderer: 'calculus_curve',
    createdAt: '2026-11-26T08:10:00.000Z',
    updatedAt: '2026-11-26T08:10:00.000Z',
    lessons: [
      {
        id: 'cv-l1-derivada-secante',
        title: 'La derivada: cuando la secante besa a la curva',
        summary: 'Observa cómo el triángulo de cambio Δy/Δx se encoge hasta revelar la pendiente instantánea en x₀.',
        renderer: 'calculus_curve',
        equation: "f'(x_0) = \\lim_{h \\to 0} \\frac{f(x_0 + h) - f(x_0)}{h}",
        explorePrompt: 'Reduce gradualmente el deslizador h hacia 0.05 y arrastra x₀ sobre la curva para ver cambiar el signo de la pendiente.',
        params: cloneParams('calculus_curve'),
        beats: [
          {
            t: 0,
            title: 'Medir el cambio entre dos instantes',
            caption: 'Con un paso h amplio, la recta secante solo aproxima la tendencia promedio.',
            equation: 'm_{\\text{secante}} = \\frac{\\Delta y}{\\Delta x} = \\frac{f(x_0+h)-f(x_0)}{h}',
            mood: 'curious',
            speechText: 'Cómo medir la velocidad exacta en un único instante si la velocidad exige comparar dos momentos distintos? Comenzamos con dos puntos separados por un paso h y dibujamos su recta secante.',
            sceneState: { mode: 'derivative', x0: 0.7, h: 1.4, n: 8 },
          },
          {
            t: 11,
            title: 'Acercar h sin llegar a cero',
            caption: 'Al achicar h, el triángulo rectángulo se vuelve microscópico pero su proporción se estabiliza.',
            equation: 'h = 0.25 \\implies \\frac{\\Delta y}{h} \\approx f\'(x_0)',
            mood: 'excited',
            speechText: 'Fíjate en el triángulo dorado mientras h se hace más pequeño: tanto la base como la altura se reducen, pero su cociente converge hacia un número concreto. Esa razón límite es la recta tangente.',
            sceneState: { mode: 'derivative', x0: 0.7, h: 0.25, n: 8 },
          },
          {
            t: 23,
            title: 'Cimas y valles: donde la pendiente se anula',
            caption: 'En los máximos y mínimos locales, la recta tangente queda perfectamente horizontal.',
            equation: "f'(x^*) = 0",
            mood: 'emphatic',
            speechText: 'Cuando mueves x cero hasta la cresta o el fondo de la curva, la tangente se vuelve plana y la derivada vale cero. Ese detalle convierte al cálculo en la herramienta reina para encontrar óptimos.',
            sceneState: { mode: 'derivative', x0: -0.9, h: 0.1, n: 8 },
          },
          {
            t: 35,
            title: 'Una lupa lineal para curvas complejas',
            caption: 'Cualquier función suave parece una línea recta si haces suficiente zoom.',
            equation: "f(x_0 + dx) \\approx f(x_0) + f'(x_0)\\,dx",
            mood: 'neutral',
            speechText: 'La derivada no es un truco simbólico: es la mejor aproximación lineal local de cualquier fenómeno continuo, desde trayectorias físicas hasta sensibilidad de precios.',
            sceneState: { mode: 'derivative', x0: 1.1, h: 0.15, n: 8 },
          },
        ],
        quiz: {
          question: '¿Qué representa geométricamente el cociente [f(x₀ + h) - f(x₀)] / h antes de tomar el límite h → 0?',
          options: [
            'La pendiente de la recta secante que une dos puntos de la curva',
            'El área total debajo de la curva entre 0 y x₀',
            'La segunda derivada evaluada en el origen',
            'El volumen de revolución alrededor del eje Y',
          ],
          correctIndex: 0,
          explanation: 'Para h > 0, el cociente mide Δy/Δx entre (x₀, f(x₀)) y (x₀+h, f(x₀+h)), es decir, la pendiente de la recta secante.',
        },
      },
      {
        id: 'cv-l2-integral-riemann',
        title: 'Integrales: acumular rectángulos hasta el área exacta',
        summary: 'Divide una región curva en n franjas verticales y comprueba por qué integrar y derivar son procesos inversos.',
        renderer: 'calculus_curve',
        equation: '\\int_{a}^{b} f(x)\\,dx = \\lim_{n \\to \\infty} \\sum_{i=1}^{n} f(x_i)\\,\\Delta x',
        explorePrompt: 'Incrementa el número de particiones n desde 2 hasta 32 y observa cómo desaparecen los escalones sobre la curva.',
        params: [
          { id: 'x0', label: 'Límite superior x₀', min: -2.5, max: 2.5, step: 0.1, default: 1.6, unit: '' },
          { id: 'h', label: 'Paso Δx (h)', min: 0.05, max: 2.0, step: 0.05, default: 0.3, unit: '' },
          { id: 'n', label: 'Particiones (n)', min: 2, max: 32, step: 1, default: 6, unit: '' },
        ],
        beats: [
          {
            t: 0,
            title: 'Cortar lo imposible en rectángulos simples',
            caption: 'Con pocos rectángulos, el área aproximada deja huecos visibles frente a la curva.',
            equation: 'S_n = \\sum_{i=1}^{n} f(x_i)\\,\\Delta x',
            mood: 'curious',
            speechText: 'Calcular el área bajo una curva sinuosa parece difícil hasta que aplicamos la estrategia más honesta de la ingeniería: partir el problema en rectángulos estrechos cuya área sabemos multiplicar al instante.',
            sceneState: { mode: 'integral', x0: 1.6, h: 0.3, n: 4 },
          },
          {
            t: 11,
            title: 'Refinar la malla hacia el continuo',
            caption: 'Al duplicar y cuadruplicar n, la suma de Riemann abraza con precisión la silueta.',
            equation: '\\Delta x = \\frac{b - a}{n} \\longrightarrow 0',
            mood: 'excited',
            speechText: 'Mira qué sucede cuando subimos n de cuatro a veinticuatro particiones: las puntas sobrantes y los huecos se encogen velozmente, revelando la integral definida en color esmeralda.',
            sceneState: { mode: 'integral', x0: 1.6, h: 0.2, n: 24 },
          },
          {
            t: 23,
            title: 'El puente dorado: Teorema Fundamental',
            caption: 'La velocidad con que crece el área acumulada A(x) es precisamente la altura f(x).',
            equation: "\\frac{d}{dx}\\int_{a}^{x} f(t)\\,dt = f(x)",
            mood: 'emphatic',
            speechText: 'Si mueves el borde derecho un pasito dx, cuánto crece el área pintada? Crece una tirita delgada de ancho dx y altura f de x. Por eso la derivada del área acumulada devuelve la función original.',
            sceneState: { mode: 'integral', x0: 1.9, h: 0.15, n: 18 },
          },
          {
            t: 35,
            title: 'Más allá de la geometría',
            caption: 'Distancia desde velocidad, ingresos acumulados o probabilidad continua comparten la misma idea.',
            equation: '\\text{Total} = \\int \\text{Tasa instantánea}\\,dt',
            mood: 'neutral',
            speechText: 'Cada vez que acumulas un flujo en el tiempo —energía, flujo de caja o probabilidad— estás calculando una integral. Experimenta variando n y x₀ en la barra inferior.',
            sceneState: { mode: 'integral', x0: 1.6, h: 0.25, n: 14 },
          },
        ],
        quiz: {
          question: 'Según el Teorema Fundamental del Cálculo, si A(x) es el área acumulada bajo f(t) desde a hasta x, ¿a qué equivale A\'(x)?',
          options: [
            'A la altura de la curva f(x) en ese punto',
            'Al número de rectángulos n elegido',
            'A cero siempre que f(x) sea positiva',
            'A la suma de las pendientes en los extremos',
          ],
          correctIndex: 0,
          explanation: 'El incremento de área en un pequeño ancho dx es aproximadamente f(x)·dx, por lo que dA/dx = f(x).',
        },
      },
      {
        id: 'cv-l3-descenso-gradiente',
        title: 'Descenso de gradiente: optimizar navegando por pendientes',
        summary: 'Conecta la derivada con la inteligencia artificial siguiendo una esfera que desciende hacia el mínimo de costo.',
        renderer: 'calculus_curve',
        equation: "x_{k+1} = x_k - \\eta\\,f'(x_k)",
        explorePrompt: 'Coloca x₀ en una pendiente pronunciada y modifica h como tamaño de paso para explorar cómo la esfera busca el valle.',
        params: [
          { id: 'x0', label: 'Posición inicial x₀', min: -2.5, max: 2.5, step: 0.1, default: 1.8, unit: '' },
          { id: 'h', label: 'Tasa de paso (η)', min: 0.05, max: 2.0, step: 0.05, default: 0.45, unit: '' },
          { id: 'n', label: 'Iteraciones (n)', min: 2, max: 32, step: 1, default: 10, unit: '' },
        ],
        beats: [
          {
            t: 0,
            title: 'Bajar la montaña con brújula local',
            caption: 'No ves todo el mapa a la vez, pero la pendiente bajo tus pies te indica hacia dónde bajar.',
            equation: "f'(x_k) > 0 \\implies \\text{mover hacia la izquierda}",
            mood: 'curious',
            speechText: 'Imagina caminar en la niebla buscando el punto más bajo de un valle. No ves el horizonte, pero sientes la inclinación del terreno bajo tus zapatos: si sube hacia la derecha, caminas hacia la izquierda.',
            sceneState: { mode: 'gradient', x0: 1.8, h: 0.45, n: 10 },
          },
          {
            t: 11,
            title: 'El peligro de pasos gigantes',
            caption: 'Si la tasa η es excesiva, la esfera salta al otro lado del valle en lugar de asentarse.',
            equation: '\\eta \\gg 0 \\implies \\text{divergencia u oscilación}',
            mood: 'excited',
            speechText: 'El tamaño del paso es crucial. Con un paso demasiado agresivo rebotas de ladera en ladera sin detenerte en el mínimo; con un paso moderado te frenas suavemente cuando la pendiente se aplana.',
            sceneState: { mode: 'gradient', x0: -1.7, h: 1.2, n: 10 },
          },
          {
            t: 23,
            title: 'Convergencia al mínimo local',
            caption: 'Cerca del fondo, f\'(x) se acerca a cero y los saltos se vuelven delicados.',
            equation: "\\lim_{k\\to\\infty} f'(x_k) = 0",
            mood: 'neutral',
            speechText: 'Observa la trayectoria de puntos dorados aterrizando en el valle: conforme disminuye la pendiente, el propio algoritmo reduce sus zancadas de forma natural hasta reposar en el mínimo.',
            sceneState: { mode: 'gradient', x0: 1.3, h: 0.35, n: 14 },
          },
          {
            t: 35,
            title: 'El corazón numérico de la IA moderna',
            caption: 'En millones de dimensiones, el vector gradiente ∇L guía cada paso de entrenamiento.',
            equation: '\\theta_{k+1} = \\theta_k - \\eta\\,\\nabla\\mathcal{L}(\\theta_k)',
            mood: 'emphatic',
            speechText: 'Cuando reemplazas esta curva de una variable por una superficie de millones de pesos neuronales, la misma brújula —ahora llamada gradiente— entrena los modelos de visión, audio y lenguaje actuales.',
            sceneState: { mode: 'gradient', x0: 1.8, h: 0.4, n: 12 },
          },
        ],
        quiz: {
          question: 'En la regla de descenso de gradiente x_{k+1} = x_k - η·f\'(x_k), ¿por qué restamos el término η·f\'(x_k)?',
          options: [
            'Porque f\'(x) apunta hacia donde la función crece y queremos movernos en sentido opuesto para minimizarla',
            'Para aumentar el error en cada iteración',
            'Porque las derivadas siempre son negativas',
            'Para convertir la función en una integral definida',
          ],
          correctIndex: 0,
          explanation: 'El gradiente señala la dirección de máximo ascenso; restarlo nos desplaza cuesta abajo hacia el mínimo.',
        },
      },
    ],
  },
  {
    id: 'pensamiento-bayesiano-probabilidad',
    slug: 'pensamiento-bayesiano-probabilidad',
    topic: 'Teorema de Bayes, probabilidad condicional y distribución normal',
    title: 'Pensamiento Bayesiano y Probabilidad Visual',
    subtitle: 'Aprende a actualizar decisiones bajo incertidumbre viendo áreas de evidencia en vez de memorizar fórmulas aisladas.',
    programSlug: 'maestria-en-administracion-de-empresas',
    program: summarizeProgram('maestria-en-administracion-de-empresas'),
    level: 'Intermedio',
    voiceId: 'em_santa',
    source: 'curated',
    renderer: 'probability_dist',
    createdAt: '2026-11-26T08:15:00.000Z',
    updatedAt: '2026-11-26T08:15:00.000Z',
    lessons: [
      {
        id: 'pb-l1-bayes-cuadrado',
        title: 'El Teorema de Bayes en un cuadrado unitario',
        summary: 'Transforma probabilidades condicionales en porciones visibles de un cuadrado de área 1.',
        renderer: 'probability_dist',
        equation: 'P(H\\mid E) = \\frac{P(H)\\,P(E\\mid H)}{P(H)\\,P(E\\mid H) + P(\\neg H)\\,P(E\\mid \\neg H)}',
        explorePrompt: 'Desliza la probabilidad previa P(H) y observa cómo cambia la proporción del rectángulo de aciertos frente a las falsas alarmas.',
        params: cloneParams('probability_dist'),
        beats: [
          {
            t: 0,
            title: 'Tu creencia inicial ocupa un ancho del cuadrado',
            caption: 'Antes de ver evidencia nueva, la tasa base P(H) parte el universo en dos franjas verticales.',
            equation: 'P(H) + P(\\neg H) = 1',
            mood: 'curious',
            speechText: 'Cuando tomas una decisión gerencial, diagnóstica o comercial, casi nunca empiezas desde cero. La probabilidad previa P de H divide todo el universo posible en dos columnas dentro de este cuadrado unitario.',
            sceneState: { mode: 'bayes', prior: 0.12, sensitivity: 0.92, falsePos: 0.08 },
          },
          {
            t: 12,
            title: 'La evidencia recorta el universo',
            caption: 'Solo sobreviven las áreas iluminadas donde la señal o prueba dio positivo.',
            equation: 'P(E) = P(H\\cap E) + P(\\neg H\\cap E)',
            mood: 'excited',
            speechText: 'Ahora llega una nueva señal: por ejemplo, una alerta crediticia o una prueba piloto favorable. Al condicionar sobre esa evidencia, descartamos todo lo oscuro y nos concentramos únicamente en la suma de las dos áreas iluminadas.',
            sceneState: { mode: 'bayes', prior: 0.25, sensitivity: 0.9, falsePos: 0.1 },
          },
          {
            t: 24,
            title: 'La proporción ganadora',
            caption: 'La probabilidad posterior es simplemente el área cian dividida entre toda el área iluminada.',
            equation: 'P(H\\mid E) = \\frac{\\text{Área verdadera}}{\\text{Área verdadera} + \\text{Falso positivo}}',
            mood: 'emphatic',
            speechText: 'Mira qué transparente resulta Bayes visualmente: no hay magia algebraica. Es literalmente preguntar qué fracción de toda la superficie encendida corresponde a la hipótesis real en color cian.',
            sceneState: { mode: 'bayes', prior: 0.12, sensitivity: 0.92, falsePos: 0.08 },
          },
          {
            t: 36,
            title: 'Actualizar hoy es el prior de mañana',
            caption: 'Cada nueva pieza de evidencia convierte el posterior de hoy en tu punto de partida.',
            equation: 'P_{\\text{nuevo}}(H) = P(H\\mid E_1)',
            mood: 'neutral',
            speechText: 'En analítica de negocios, la disciplina bayesiana permite iterar campañas y riesgos con frialdad matemática: cada experimento actualiza tu cuadrado y reduce la incertidumbre estratégica.',
            sceneState: { mode: 'bayes', prior: 0.4, sensitivity: 0.9, falsePos: 0.06 },
          },
        ],
        quiz: {
          question: 'En la interpretación geométrica del cuadrado unitario, ¿qué representa el denominador P(E) del Teorema de Bayes?',
          options: [
            'La suma total del área donde ocurrió la evidencia: verdaderos positivos más falsos positivos',
            'Únicamente la franja vertical de la hipótesis nula',
            'La desviación estándar de la muestra',
            'El error de redondeo de la tasa base',
          ],
          correctIndex: 0,
          explanation: 'Al observar la evidencia E, nuestro espacio muestral se restringe a la suma de P(H∩E) y P(¬H∩E).',
        },
      },
      {
        id: 'pb-l2-falsos-positivos',
        title: 'La paradoja de la tasa base y los falsos positivos',
        summary: 'Por qué una prueba con 95% de precisión puede equivocarse la mitad de las veces cuando el evento buscado es raro.',
        renderer: 'probability_dist',
        equation: '\\text{Si } P(H) = 0.02,\\; P(E\\mid\\neg H) = 0.05 \\implies P(H\\mid E) < 0.30',
        explorePrompt: 'Baja prior a 0.03 manteniendo sensibilidad alta (0.95) y sube ligeramente falsePos para ver crecer el área coral.',
        params: [
          { id: 'prior', label: 'Tasa base P(H)', min: 0.01, max: 0.95, step: 0.01, default: 0.04, unit: '' },
          { id: 'sensitivity', label: 'Sensibilidad P(E|H)', min: 0.5, max: 0.99, step: 0.01, default: 0.95, unit: '' },
          { id: 'falsePos', label: 'Falso positivo P(E|¬H)', min: 0.01, max: 0.4, step: 0.01, default: 0.08, unit: '' },
        ],
        beats: [
          {
            t: 0,
            title: 'Cuando el evento real es escaso',
            caption: 'Una franja previa del 4% deja el 96% del cuadrado en la columna contraria.',
            equation: 'P(\\neg H) = 0.96',
            mood: 'curious',
            speechText: 'Supongamos que detectamos fraude financiero o una falla rara que afecta apenas al cuatro por ciento de los casos. Incluso antes de mirar la alerta, noventa y seis de cada cien casos pertenecen al lado negativo.',
            sceneState: { mode: 'bayes', prior: 0.04, sensitivity: 0.95, falsePos: 0.08 },
          },
          {
            t: 12,
            title: 'Un pequeño porcentaje de una gran multitud',
            caption: 'El 8% de 96% supera fácilmente al 95% de 4%.',
            equation: '0.96 \\times 0.08 = 0.0768 \\; > \\; 0.04 \\times 0.95 = 0.038',
            mood: 'emphatic',
            speechText: 'Observa el rectángulo coral de falsos positivos: aunque el error sea solo del ocho por ciento, se multiplica por una columna gigante del noventa y seis por ciento y termina superando al área cian.',
            sceneState: { mode: 'bayes', prior: 0.04, sensitivity: 0.95, falsePos: 0.08 },
          },
          {
            t: 24,
            title: 'La intuición ejecutiva que evita errores costosos',
            caption: 'Sin considerar la tasa base, cualquier equipo sobre-reacciona a alertas ruidosas.',
            equation: 'P(H\\mid E) \\approx 33\\%',
            mood: 'excited',
            speechText: 'Por eso en el MBA con mención en Analítica de Negocios de UCG insistimos en cruzar cada indicador con su tasa base antes de escalar costos operativos sobre falsas alarmas.',
            sceneState: { mode: 'bayes', prior: 0.08, sensitivity: 0.95, falsePos: 0.05 },
          },
          {
            t: 35,
            title: 'Cómo mejorar la certeza real',
            caption: 'Combinar una segunda señal independiente o reducir falsos positivos dispara el posterior.',
            equation: 'P(E\\mid \\neg H) \\downarrow \\;\\implies\\; P(H\\mid E) \\uparrow',
            mood: 'neutral',
            speechText: 'Baja el deslizador de falsos positivos hacia uno por ciento y verás cómo el indicador posterior salta de inmediato. Dos filtros secuenciales multiplican tu precisión sin costo extra.',
            sceneState: { mode: 'bayes', prior: 0.04, sensitivity: 0.95, falsePos: 0.01 },
          },
        ],
        quiz: {
          question: 'Si un evento ocurre en solo 2% de los clientes y un detector tiene 10% de falsos positivos, ¿qué suele ocurrir ante una alerta?',
          options: [
            'La mayoría de las alertas seguirán siendo falsos positivos por el peso de la tasa base',
            'La probabilidad posterior siempre superará el 90%',
            'La sensibilidad deja de intervenir en el cálculo',
            'El cuadrado unitario aumenta de área a 2.0',
          ],
          correctIndex: 0,
          explanation: 'El 10% de 98% (9.8%) supera ampliamente incluso al 100% de 2% (2%), ilustrando la falacia de ignorar la tasa base.',
        },
      },
      {
        id: 'pb-l3-campana-gaussiana',
        title: 'La campana gaussiana, media y bandas de confianza',
        summary: 'Explora cómo μ centra una distribución y σ controla la dispersión de riesgos, tiempos y pronósticos.',
        renderer: 'probability_dist',
        equation: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\,e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}',
        explorePrompt: 'Desliza μ para mover el centro de la campana y reduce σ para concentrar el 68% de la masa alrededor de la media.',
        params: cloneParams('probability_dist_gaussian'),
        beats: [
          {
            t: 0,
            title: 'Por qué aparece la campana en todas partes',
            caption: 'Sumar muchas pequeñas causas independientes converge hacia la distribución normal.',
            equation: '\\bar{X}_n \\xrightarrow{d} \\mathcal{N}(\\mu, \\sigma^2/n)',
            mood: 'curious',
            speechText: 'Desde tiempos de entrega logística hasta variaciones en demanda semanal, cuando muchos factores pequeños se suman entre sí, la naturaleza dibuja una silueta simétrica inconfundible: la campana de Gauss.',
            sceneState: { mode: 'gaussian', mu: 0.0, sigma: 0.85 },
          },
          {
            t: 11,
            title: 'Dos números gobiernan toda la curva',
            caption: 'La media μ fija la ubicación; la desviación estándar σ mide cuán dispersos están los escenarios.',
            equation: 'P(\\mu - \\sigma \\le X \\le \\mu + \\sigma) \\approx 68.2\\%',
            mood: 'excited',
            speechText: 'Toda esta curva infinita queda definida por solo dos parámetros: mu traslada el pico de izquierda a derecha, mientras sigma determina si el futuro es estrecho y predecible o ancho y volátil.',
            sceneState: { mode: 'gaussian', mu: 0.4, sigma: 0.5 },
          },
          {
            t: 23,
            title: 'La regla empírica 68 · 95 · 99.7',
            caption: 'A dos desviaciones estándar se concentra el 95% de los resultados esperados.',
            equation: 'P(|X - \\mu| \\le 2\\sigma) \\approx 95.4\\%',
            mood: 'neutral',
            speechText: 'La región sombreada alrededor del centro reúne cerca del sesenta y ocho por ciento de probabilidad dentro de una desviación sigma, y el noventa y cinco por ciento dentro de dos. Así nacen los intervalos de confianza.',
            sceneState: { mode: 'gaussian', mu: -0.3, sigma: 1.15 },
          },
          {
            t: 35,
            title: 'Cuidado con las colas anchas',
            caption: 'Aumentar σ aplana el pico pero multiplica la exposición a escenarios extremos.',
            equation: '\\text{Área total} = \\int_{-\\infty}^{\\infty} f(x)\\,dx = 1',
            mood: 'emphatic',
            speechText: 'Nota que cuando estiras sigma, el pico necesariamente baja porque el área total bajo la curva siempre vale uno. Comprender la forma de las colas es clave para gestionar riesgos reales.',
            sceneState: { mode: 'gaussian', mu: 0.0, sigma: 1.5 },
          },
        ],
        quiz: {
          question: 'Si duplicamos la desviación estándar σ manteniendo constante la media μ, ¿qué sucede con el pico central de la curva normal?',
          options: [
            'Se aplana a la mitad de altura porque el área total bajo la curva debe seguir siendo 1',
            'Se duplica en altura',
            'Se desplaza hacia x = 2',
            'Deja de ser simétrica',
          ],
          correctIndex: 0,
          explanation: 'El factor 1/(σ√(2π)) reduce la altura máxima inversamente con σ para conservar intacta la probabilidad total igual a 1.',
        },
      },
    ],
  },
  {
    id: 'finanzas-cuantitativas-vpn',
    slug: 'finanzas-cuantitativas-vpn',
    topic: 'Interés compuesto, valor del dinero en el tiempo y VPN',
    title: 'Finanzas Cuantitativas, Interés Compuesto y VPN',
    subtitle: 'Visualiza por qué el crecimiento exponencial sorprende al cerebro lineal y cómo descontar flujos futuros en proyectos reales.',
    programSlug: 'maestria-en-administracion-de-empresas',
    program: summarizeProgram('maestria-en-administracion-de-empresas'),
    level: 'Ejecutivo',
    voiceId: 'ef_dora',
    source: 'curated',
    renderer: 'compound_growth',
    createdAt: '2026-11-26T08:20:00.000Z',
    updatedAt: '2026-11-26T08:20:00.000Z',
    lessons: [
      {
        id: 'fc-l1-interes-compuesto',
        title: 'Por qué el interés compuesto vence a la intuición lineal',
        summary: 'Compara el crecimiento aditivo frente al multiplicativo y descubre el peso real del horizonte temporal.',
        renderer: 'compound_growth',
        equation: 'V_t = C_0\\,(1 + r)^t',
        explorePrompt: 'Aumenta los años de 10 a 25 y observa cómo la brecha sombreada sobre la línea recta domina el patrimonio final.',
        params: cloneParams('compound_growth'),
        beats: [
          {
            t: 0,
            title: 'Dos motores muy distintos de crecimiento',
            caption: 'El interés simple suma siempre sobre el capital inicial; el compuesto reinvierte cada fruto.',
            equation: 'V_{\\text{simple}}(t) = C_0(1 + r\\,t) \\quad \\text{vs.} \\quad C_0(1+r)^t',
            mood: 'curious',
            speechText: 'Nuestro cerebro está entrenado para proyectar en línea recta. Durante los primeros años, la curva exponencial y la recta simple avanzan casi juntas, ocultando la fuerza que se acumula debajo.',
            sceneState: { showLinear: true, highlightYear: 5 },
          },
          {
            t: 11,
            title: 'El punto de inflexión exponencial',
            caption: 'Alrededor del año 10, los rendimientos sobre rendimientos superan al aporte original.',
            equation: '\\Delta V_t = r \\cdot V_{t-1}',
            mood: 'excited',
            speechText: 'A partir de cierto horizonte, cada nuevo período aplica el porcentaje sobre una base mucho más grande. La región sombreada entre ambas curvas representa literalmente el interés generado por tus propios intereses.',
            sceneState: { showLinear: true, highlightYear: 12 },
          },
          {
            t: 23,
            title: 'La regla rápida del 72',
            caption: 'Dividir 72 entre la tasa porcentual estima en cuántos años se duplica un capital.',
            equation: 'T_{\\text{duplicación}} \\approx \\frac{72}{r_{\\%}}',
            mood: 'neutral',
            speechText: 'Un atajo ejecutivo infalible: divide setenta y dos entre la tasa anual. Al doce por ciento anual, tu capital se duplica en seis años; al seis por ciento, tarda doce años. Tres puntos porcentuales cambian décadas de resultado.',
            sceneState: { showLinear: true, highlightYear: 18 },
          },
          {
            t: 35,
            title: 'Tiempo como palanca financiera',
            caption: 'Empezar antes suele pesar más que aportar montos mayores tarde.',
            equation: 'V_{20} = C_0(1+r)^{10}(1+r)^{10}',
            mood: 'emphatic',
            speechText: 'El exponente t es la variable con mayor potencia en finanzas. Prueba subir la tasa de ocho a quince por ciento y observa el salto instantáneo en el marcador final.',
            sceneState: { showLinear: true, highlightYear: 20 },
          },
        ],
        quiz: {
          question: 'Según la regla del 72, aproximadamente en cuántos años se duplica un capital a una tasa compuesta del 9% anual?',
          options: [
            'Alrededor de 8 años (72 / 9)',
            'En 4 años',
            'En 18 años',
            'En 72 años',
          ],
          correctIndex: 0,
          explanation: 'Dado que ln(2) ≈ 0.693, dividir 72 entre la tasa porcentual (72 / 9 = 8) da una estimación muy precisa del tiempo de duplicación.',
        },
      },
      {
        id: 'fc-l2-valor-presente-neto',
        title: 'Valor Presente Neto (VPN): traer el futuro a dólares de hoy',
        summary: 'Descuenta flujos futuros de caja con la tasa WACC y decide objetivamente si un proyecto crea valor.',
        renderer: 'compound_growth',
        equation: '\\text{VPN} = -I_0 + \\sum_{t=1}^{T} \\frac{F_t}{(1 + k)^t}',
        explorePrompt: 'Ajusta la tasa anual k y el capital para medir cuánto pesa el descuento compuesto sobre los flujos lejanos.',
        params: [
          { id: 'capital', label: 'Inversión / Flujo base', min: 1000, max: 50000, step: 500, default: 15000, unit: 'USD' },
          { id: 'rate', label: 'Tasa de descuento (k)', min: 1, max: 25, step: 0.5, default: 11, unit: '%' },
          { id: 'years', label: 'Vida del proyecto', min: 1, max: 25, step: 1, default: 8, unit: 'años' },
        ],
        beats: [
          {
            t: 0,
            title: 'Un dólar mañana vale menos que un dólar hoy',
            caption: 'El dinero presente puede invertirse hoy, asumir menos riesgo y generar flujo inmediato.',
            equation: 'VP = \\frac{F_t}{(1 + k)^t}',
            mood: 'curious',
            speechText: 'Sumar sin más el dinero que recibirás dentro de cinco años con la inversión que desembolsas hoy es un error frecuente. El factor uno más k elevado a t funciona como el inverso exacto del interés compuesto.',
            sceneState: { showLinear: true, highlightYear: 4 },
          },
          {
            t: 11,
            title: 'El costo de oportunidad k',
            caption: 'La tasa de descuento refleja el retorno mínimo que exige el inversionista por el riesgo.',
            equation: 'k = \\text{WACC} = w_e r_e + w_d r_d(1-T)',
            mood: 'neutral',
            speechText: 'Cuando descuentas flujos con el costo de capital promedio ponderado, exiges que el proyecto supere la mejor alternativa comparable de riesgo. Si k sube, los flujos lejanos pierden peso presente.',
            sceneState: { showLinear: true, highlightYear: 8 },
          },
          {
            t: 23,
            title: 'La regla de oro del VPN > 0',
            caption: 'Un VPN positivo indica creación neta de riqueza por encima del rendimiento exigido.',
            equation: '\\text{VPN} > 0 \\implies \\text{Aprobar inversión}',
            mood: 'excited',
            speechText: 'Si después de traer todos los flujos al presente y restar la inversión inicial el saldo sigue positivo, el proyecto no solo recupera la inversión y el retorno exigido, sino que añade valor puro a la empresa.',
            sceneState: { showLinear: true, highlightYear: 10 },
          },
          {
            t: 35,
            title: 'Aplicación directa en el MBA UCG',
            caption: 'En Finanzas Generales y Laboratorios del MBA evaluarás casos empresariales reales.',
            equation: '\\text{TIR}: \\; \\text{VPN}(k = \\text{TIR}) = 0',
            mood: 'emphatic',
            speechText: 'Esta lógica conecta directamente Finanzas Generales con los laboratorios de estrategia de la Maestría en Administración de Empresas de UCG, integrando riesgo, retorno y creación de valor sostenible.',
            sceneState: { showLinear: true, highlightYear: 12 },
          },
        ],
        quiz: {
          question: 'Si aumenta la tasa de descuento k exigida a un proyecto con flujos futuros positivos, ¿qué ocurre con su VPN?',
          options: [
            'El VPN disminuye porque cada flujo futuro se divide por un factor (1+k)^t mayor',
            'El VPN aumenta automáticamente',
            'El VPN solo depende de la inversión inicial I₀',
            'Los flujos del año 10 pesan más que los del año 1',
          ],
          correctIndex: 0,
          explanation: 'Al subir k en el denominador (1 + k)^t, el valor presente de cada flujo futuro cae y reduce el VPN.',
        },
      },
      {
        id: 'fc-l3-sensibilidad-horizonte',
        title: 'Sensibilidad financiera, inflación y poder adquisitivo real',
        summary: 'Mide cómo pequeños cambios de tasa real e inflación erosionan o multiplican el retorno neto a largo plazo.',
        renderer: 'compound_growth',
        equation: '1 + r_{\\text{real}} = \\frac{1 + r_{\\text{nominal}}}{1 + \\pi}',
        explorePrompt: 'Prueba comparar tasas de 4% vs 14% en horizontes de 15 a 20 años para visualizar la sensibilidad exponencial.',
        params: [
          { id: 'capital', label: 'Capital base', min: 1000, max: 50000, step: 500, default: 20000, unit: 'USD' },
          { id: 'rate', label: 'Tasa real neta', min: 1, max: 25, step: 0.5, default: 8.5, unit: '%' },
          { id: 'years', label: 'Horizonte', min: 1, max: 25, step: 1, default: 15, unit: 'años' },
        ],
        beats: [
          {
            t: 0,
            title: 'Tasa nominal frente a tasa real',
            caption: 'El rendimiento aparente engaña si no descontamos inflación y comisiones.',
            equation: 'r_{\\text{real}} \\approx r_{\\text{nominal}} - \\pi',
            mood: 'curious',
            speechText: 'Ganar un nueve por ciento nominal cuando la inflación ronda el tres por ciento deja un crecimiento real cercano al seis por ciento. En evaluación seria de inversiones, siempre modelamos en términos reales coherentes.',
            sceneState: { showLinear: true, highlightYear: 7 },
          },
          {
            t: 11,
            title: 'Elasticidad ante variaciones de tasa',
            caption: 'En plazos largos, dos puntos porcentuales adicionales cambian radicalmente la curva.',
            equation: '\\frac{\\partial V_t}{\\partial r} = t\\,C_0(1+r)^{t-1}',
            mood: 'excited',
            speechText: 'La sensibilidad respecto a la tasa r crece de manera proporcional al tiempo t. Por eso una mejora pequeña en estructura financiera o margen operativo se amplifica de forma dramática al proyectar diez o quince años.',
            sceneState: { showLinear: true, highlightYear: 15 },
          },
          {
            t: 23,
            title: 'Simulación de escenarios base, optimista y estrés',
            caption: 'Probar bandas de tasa protege a la empresa antes de comprometer capital.',
            equation: 'r \\in [r_{\\text{estrés}},\\; r_{\\text{base}},\\; r_{\\text{meta}}]',
            mood: 'neutral',
            speechText: 'En lugar de confiar en una única cifra optimista, los directores financieros prueban la resiliencia del flujo bajando la tasa neta y acortando el horizonte útil.',
            sceneState: { showLinear: true, highlightYear: 11 },
          },
          {
            t: 35,
            title: 'Controla las palancas clave',
            caption: 'Capital, tasa y tiempo actúan juntos como un sistema dinámico.',
            equation: 'V_t = C_0\\,(1 + r_{\\text{real}})^t',
            mood: 'emphatic',
            speechText: 'Mueve ahora los tres controles de abajo para comparar un capital alto a tasa moderada frente a un capital menor sostenido con disciplina durante veinte años.',
            sceneState: { showLinear: true, highlightYear: 20 },
          },
        ],
        quiz: {
          question: 'Según la ecuación de Fisher, si una inversión rinde 10% nominal anual y la inflación es 4%, ¿cuál es aproximadamente la tasa real?',
          options: [
            'Cercana al 5.77% (aprox. 6%)',
            'Exactamente 14%',
            'Exactamente 40%',
            'Cero por ciento',
          ],
          correctIndex: 0,
          explanation: 'Usando (1 + 0.10) / (1 + 0.04) - 1 = 0.0577 (5.77%), muy próximo a la aproximación 10% - 4% = 6%.',
        },
      },
    ],
  },
  {
    id: 'ciberseguridad-flujos-defensa',
    slug: 'ciberseguridad-flujos-defensa',
    topic: 'Ciberseguridad, criptografía y arquitectura Zero Trust',
    title: 'Ciberseguridad, Criptografía y Flujos de Defensa',
    subtitle: 'Simula paquetes de datos, capas criptográficas, cuellos de botella y resiliencia operativa en tiempo real.',
    programSlug: 'maestria-en-ciberseguridad',
    program: summarizeProgram('maestria-en-ciberseguridad'),
    level: 'Ejecutivo',
    voiceId: 'em_alex',
    source: 'curated',
    renderer: 'system_flow',
    createdAt: '2026-11-26T08:25:00.000Z',
    updatedAt: '2026-11-26T08:25:00.000Z',
    lessons: [
      {
        id: 'cs-l1-defensa-profundidad',
        title: 'Defensa en profundidad y resiliencia de arquitectura',
        summary: 'Visualiza cómo capas independientes —perímetro, identidad, inspección y respaldo— contienen intrusiones sin frenar el negocio.',
        renderer: 'system_flow',
        equation: 'P(\\text{brecha}) = \\prod_{i=1}^{k} (1 - d_i), \\quad R = 1 - P(\\text{brecha})',
        explorePrompt: 'Sube la carga de tráfico y reduce la cobertura de defensa para ver dónde aparecen alertas rojas y latencia acumulada.',
        params: cloneParams('system_flow'),
        beats: [
          {
            t: 0,
            title: 'Ningún muro único es invencible',
            caption: 'Cada nodo del flujo verifica contexto distinto: red, identidad, sesión y datos.',
            equation: 'R_{\\text{una capa}} = d_1 \\; < \\; 1 - (1-d_1)(1-d_2)(1-d_3)',
            mood: 'curious',
            speechText: 'Confiar toda la seguridad a un único firewall equivale a cerrar la puerta principal dejando abiertas las ventanas internas. La defensa en profundidad encadena controles independientes a lo largo de todo el flujo.',
            sceneState: { activeNode: 1, attackPulse: true },
          },
          {
            t: 11,
            title: 'El efecto multiplicador sobre el riesgo',
            caption: 'Tres controles con 70% de eficacia individual reducen la brecha residual por debajo del 3%.',
            equation: '(1 - 0.7)^3 = 0.027 \\implies 97.3\\% \\text{ de contención}',
            mood: 'excited',
            speechText: 'Aunque ninguna barrera sea perfecta al cien por ciento, encadenar tres capas independientes multiplica la probabilidad de fallo hacia valores mínimos. Observa en el diagrama cómo los paquetes anómalos se filtran por etapas.',
            sceneState: { activeNode: 2, attackPulse: true },
          },
          {
            t: 23,
            title: 'El costo real: latencia vs. protección',
            caption: 'Inspeccionar en exceso bajo tráfico pico puede crear cuellos de botella operativos.',
            equation: 'T_{\\text{total}} = \\sum_{i} \\text{latencia}_i + \\text{cola}(\\rho)',
            mood: 'neutral',
            speechText: 'Todo control consume milisegundos. Un buen arquitecto de seguridad equilibra la cobertura defensiva con la latencia de inspección para que la organización siga operando con fluidez incluso bajo picos de demanda.',
            sceneState: { activeNode: 3, attackPulse: false },
          },
          {
            t: 35,
            title: 'Formación práctica en Ciberseguridad UCG',
            caption: 'Incluye preparación EC-Council en Defensa de Redes, Hacking Ético e Informática Forense.',
            equation: '\\text{Detectar} \\to \\text{Contener} \\to \\text{Recuperar}',
            mood: 'emphatic',
            speechText: 'En la Maestría en Ciberseguridad de la Universidad Casa Grande se combinan defensa de redes, análisis forense y continuidad del negocio con certificación EC-Council integrada.',
            sceneState: { activeNode: 4, attackPulse: false },
          },
        ],
        quiz: {
          question: 'Si dos controles independientes tienen una eficacia de 80% cada uno frente a un ataque, ¿cuál es la probabilidad aproximada de que el ataque atraviese ambos?',
          options: [
            '4% (0.20 × 0.20)',
            '40%',
            '80%',
            '0%',
          ],
          correctIndex: 0,
          explanation: 'Cada capa deja pasar el 20% (0.20); al ser independientes, la probabilidad conjunta de falla es 0.20 × 0.20 = 0.04 (4%).',
        },
      },
      {
        id: 'cs-l2-criptografia-flujo',
        title: 'Criptografía asimétrica, firmas y canales seguros',
        summary: 'Comprende el intercambio de llaves y la verificación de integridad que protegen cada paquete en tránsito.',
        renderer: 'system_flow',
        equation: 'm \\equiv (m^e)^d \\pmod{n}, \\quad \\text{Firma} = \\text{Sign}_{sk}(H(m))',
        explorePrompt: 'Observa los paquetes viajando entre nodos de cifrado y validación; ajusta defense y latency para simular verificación TLS.',
        params: [
          { id: 'throughput', label: 'Paquetes TLS/s', min: 10, max: 100, step: 5, default: 55, unit: '%' },
          { id: 'defense', label: 'Fortaleza criptográfica', min: 0, max: 100, step: 5, default: 90, unit: '%' },
          { id: 'latency', label: 'Tiempo de handshake', min: 10, max: 250, step: 5, default: 35, unit: 'ms' },
        ],
        beats: [
          {
            t: 0,
            title: 'El dilema de compartir un secreto en público',
            caption: 'Dos nodos deben hablar en privado sobre una red donde cualquiera puede escuchar.',
            equation: 'A \\xrightarrow{\\text{canal público}} B',
            mood: 'curious',
            speechText: 'Cómo puedes acordar una contraseña secreta con un servidor al otro lado del mundo si todo el cableado intermedio es observable? La criptografía asimétrica resolvió ese problema elegante mediante pares de llaves.',
            sceneState: { activeNode: 0, attackPulse: true },
          },
          {
            t: 11,
            title: 'Llave pública para cerrar, privada para abrir',
            caption: 'Cualquiera cifra con tu candado abierto; solo tu llave privada recupera el mensaje.',
            equation: 'c = E_{pk}(m) \\implies m = D_{sk}(c)',
            mood: 'excited',
            speechText: 'La clave pública funciona como un candado abierto que repartes sin miedo; una vez cerrado el paquete, ni siquiera quien lo cifró puede abrirlo de regreso. Únicamente la clave privada del destinatario abre el mensaje.',
            sceneState: { activeNode: 2, attackPulse: false },
          },
          {
            t: 23,
            title: 'Hashes y firmas garantizan integridad',
            caption: 'Cambiar un solo bit altera por completo la huella digital SHA-256 del mensaje.',
            equation: 'H(m) \\neq H(m\') \\implies \\text{manipulación detectada}',
            mood: 'emphatic',
            speechText: 'Además de confidencialidad necesitamos autenticidad. Al firmar el resumen criptográfico del mensaje con la llave privada del emisor, el receptor detecta al instante cualquier alteración en tránsito.',
            sceneState: { activeNode: 3, attackPulse: true },
          },
          {
            t: 35,
            title: 'Híbrido rápido en producción',
            caption: 'Asimetría para negociar la sesión; cifrado simétrico AES-GCM para alta velocidad.',
            equation: 'K_{\\text{sesión}} \\xrightarrow{\\text{AES-GCM}} \\text{flujo veloz}',
            mood: 'neutral',
            speechText: 'En la práctica, TLS usa criptografía asimétrica solo al inicio para acordar una llave efímera de sesión, y luego cifra miles de paquetes por segundo con algoritmos simétricos ultrarrápidos.',
            sceneState: { activeNode: 4, attackPulse: false },
          },
        ],
        quiz: {
          question: 'Para verificar que un mensaje no fue alterado y proviene realmente de un emisor, ¿con qué llave firma el emisor el hash del mensaje?',
          options: [
            'Con su propia llave privada, para que cualquiera pueda verificarla con su llave pública',
            'Con la llave pública del emisor',
            'Sin llaves, enviando el texto en claro',
            'Cambiando la latencia de red',
          ],
          correctIndex: 0,
          explanation: 'Una firma digital se crea con la llave privada del emisor y se valida públicamente con su llave pública correspondiente.',
        },
      },
      {
        id: 'cs-l3-zero-trust',
        title: 'Zero Trust, telemetría y continuidad del negocio',
        summary: 'Pasa de confiar por ubicación de red a validar cada solicitud de forma continua con mínima superficie de ataque.',
        renderer: 'system_flow',
        equation: '\\text{Acceso} = \\text{Identidad} \\land \\text{Dispositivo} \\land \\text{Mínimo Privilegio}',
        explorePrompt: 'Simula un pico de tráfico al 95% manteniendo alta defensa y observa cómo el sistema prioriza paquetes legítimos.',
        params: [
          { id: 'throughput', label: 'Solicitudes API', min: 10, max: 100, step: 5, default: 75, unit: '%' },
          { id: 'defense', label: 'Política Zero Trust', min: 0, max: 100, step: 5, default: 85, unit: '%' },
          { id: 'latency', label: 'Latencia de verificación', min: 10, max: 250, step: 5, default: 40, unit: 'ms' },
        ],
        beats: [
          {
            t: 0,
            title: 'Nunca confiar, siempre verificar',
            caption: 'Estar dentro de la red corporativa ya no otorga permiso automático.',
            equation: '\\text{Confianza implícita} = 0',
            mood: 'curious',
            speechText: 'Cuando los equipos trabajan en la nube y desde múltiples ciudades, el antiguo perímetro de oficina desaparece. Zero Trust asume que la red siempre es hostil y valida cada petición individualmente.',
            sceneState: { activeNode: 1, attackPulse: true },
          },
          {
            t: 11,
            title: 'Microsegmentación contra movimiento lateral',
            caption: 'Aislar servicios impide que una credencial comprometida escale a toda la infraestructura.',
            equation: '\\text{Radio de impacto} \\propto \\frac{1}{\\text{segmentación}}',
            mood: 'excited',
            speechText: 'Si un atacante logra comprometer un nodo periférico, la microsegmentación encierra el incidente en una celda aislada e impide que salte hacia las bases de datos críticas.',
            sceneState: { activeNode: 2, attackPulse: true },
          },
          {
            t: 23,
            title: 'Telemetría y respuesta temprana',
            caption: 'Reducir el tiempo medio de detección (MTTD) evita la interrupción operativa.',
            equation: '\\text{Impacto} \\approx \\text{MTTD} + \\text{MTTR}',
            mood: 'emphatic',
            speechText: 'La resiliencia combina prevención técnica con observación continua. Detectar anomalías en minutos y contar con respaldos inmutables garantiza la continuidad del negocio sin pagar rescates.',
            sceneState: { activeNode: 3, attackPulse: false },
          },
          {
            t: 35,
            title: 'Arquitectura lista para escalar',
            caption: 'Seguridad integrada desde el diseño protege la confianza de clientes e instituciones.',
            equation: '\\text{Seguridad} + \\text{Disponibilidad} \\implies \\text{Confianza}',
            mood: 'neutral',
            speechText: 'Experimenta ahora reduciendo la defensa a veinte por ciento y subiendo la carga de solicitudes para ver cómo cambian los indicadores de riesgo en el flujo del sistema.',
            sceneState: { activeNode: 4, attackPulse: false },
          },
        ],
        quiz: {
          question: '¿Cuál es el objetivo principal de la microsegmentación en una arquitectura Zero Trust?',
          options: [
            'Limitar el movimiento lateral si un nodo llega a ser comprometido',
            'Eliminar la necesidad de contraseñas y certificados',
            'Enviar todo el tráfico sin cifrar dentro de la red interna',
            'Aumentar intencionalmente la latencia a 250 ms',
          ],
          correctIndex: 0,
          explanation: 'La microsegmentación divide la red en zonas granulares con políticas estrictas entre sí, conteniendo brechas de forma aislada.',
        },
      },
    ],
  },
];

function inferRendererFromTopic(text, fallbackText = '') {
  const match = value => {
    const q = normalized(value || '');
    if (/(matriz|matrices|vector|algebra|lineal|eigen|espacio|transformacion)/.test(q)) return 'vector_space';
    if (/(derivad|integral|calculo|gradiente|riemann|tangente|limite|ecuacion diferencial)/.test(q)) return 'calculus_curve';
    if (/(red neuronal|redes neuronales|neuronal|deep learning|backprop|\bia\b|inteligencia artificial|machine learning|llm|transformer|perceptron)/.test(q)) return 'neural_network';
    if (/(bayes|probabilidad|estadistica|gauss|normal|incertidumbre|hipotesis|muestra|aleatori)/.test(q)) return 'probability_dist';
    if (/(finanza|interes|compuesto|vpn|valoracion|flujo de caja|inversion|tir|wacc|econom|portafolio|inflacion|rentabilidad|ahorro|contabilidad|tribut)/.test(q)) return 'compound_growth';
    return null;
  };
  return match(text) || match(fallbackText) || 'system_flow';
}

function defaultSceneState(renderer, variantIndex = 0) {
  if (renderer === 'vector_space') {
    const presets = [
      { a: 1.4, b: 0.5, c: -0.3, d: 1.2, showDeterminant: true, showEigenvectors: false },
      { a: 1.7, b: 0.4, c: 0.4, d: 1.0, showDeterminant: true, showEigenvectors: true },
      { a: 1.1, b: -0.8, c: 0.6, d: 1.3, showDeterminant: true, showEigenvectors: false },
    ];
    return presets[variantIndex % presets.length];
  }
  if (renderer === 'calculus_curve') {
    const modes = ['derivative', 'integral', 'gradient'];
    return { mode: modes[variantIndex % modes.length], x0: 1.0, h: 0.45, n: 10 };
  }
  if (renderer === 'neural_network') {
    const stages = ['forward', 'boundary', 'loss', 'backprop'];
    return { stage: stages[variantIndex % stages.length], w1: 1.6, w2: -1.1, bias: 0.2, inputA: 0.75 };
  }
  if (renderer === 'probability_dist') {
    return variantIndex % 2 === 0
      ? { mode: 'bayes', prior: 0.16, sensitivity: 0.9, falsePos: 0.08 }
      : { mode: 'gaussian', mu: 0.0, sigma: 0.85 };
  }
  if (renderer === 'compound_growth') {
    return { showLinear: true, highlightYear: 5 + variantIndex * 4 };
  }
  return { activeNode: variantIndex % 5, attackPulse: variantIndex % 2 === 0 };
}

function defaultParamsFor(renderer, sceneState) {
  if (renderer === 'probability_dist' && sceneState?.mode === 'gaussian') {
    return cloneParams('probability_dist_gaussian');
  }
  return cloneParams(renderer);
}

function normalizeParams(rawParams, renderer, sceneState) {
  const canonical = defaultParamsFor(renderer, sceneState);
  if (!Array.isArray(rawParams) || !rawParams.length) return canonical;

  const byId = new Map(canonical.map(p => [p.id, p]));
  const cleaned = [];
  for (const item of rawParams) {
    if (!item || typeof item !== 'object') continue;
    const id = clean(String(item.id || ''), 32).replace(/[^a-zA-Z0-9_]/g, '');
    if (!id) continue;
    const base = byId.get(id);
    const min = Number.isFinite(Number(item.min)) ? Number(item.min) : (base?.min ?? 0);
    const maxRaw = Number.isFinite(Number(item.max)) ? Number(item.max) : (base?.max ?? 10);
    const max = maxRaw > min ? maxRaw : min + 1;
    const step = Number.isFinite(Number(item.step)) && Number(item.step) > 0 ? Number(item.step) : (base?.step ?? 0.1);
    const defRaw = Number.isFinite(Number(item.default)) ? Number(item.default) : (base?.default ?? (min + max) / 2);
    const defVal = Math.min(max, Math.max(min, defRaw));
    cleaned.push({
      id,
      label: clean(item.label, 60) || base?.label || id,
      min,
      max,
      step,
      default: Number(defVal.toFixed(4)),
      unit: clean(item.unit, 16) || base?.unit || '',
    });
  }

  // Guarantee canonical params exist if AI omitted them or mixed names
  if (!cleaned.length) return canonical;
  for (const req of canonical) {
    if (!cleaned.some(p => p.id === req.id)) cleaned.push({ ...req });
  }
  return cleaned.slice(0, 5);
}

function normalizeBeats(rawBeats, lessonTitle, lessonSummary, lessonEquation, renderer, lessonIndex) {
  const list = Array.isArray(rawBeats) ? rawBeats.filter(b => b && typeof b === 'object') : [];
  const moods = ['curious', 'excited', 'neutral', 'emphatic'];
  const normalizedList = [];
  let lastT = -1;

  for (let i = 0; i < Math.min(5, list.length); i++) {
    const b = list[i];
    const parsedT = Number(b.t);
    const t = Number.isFinite(parsedT) && parsedT > lastT ? Math.round(parsedT) : (lastT < 0 ? 0 : lastT + 11);
    lastT = t;
    const mood = VALID_MOODS.has(b.mood) ? b.mood : moods[i % moods.length];
    const sceneState = b.sceneState && typeof b.sceneState === 'object' && !Array.isArray(b.sceneState)
      ? { ...defaultSceneState(renderer, lessonIndex + i), ...b.sceneState }
      : defaultSceneState(renderer, lessonIndex + i);
    const caption = clean(b.caption, 220) || clean(b.title, 120) || lessonSummary;
    const speechText = clean(b.speechText, 800) || caption;
    normalizedList.push({
      t,
      title: clean(b.title, 100) || `Momento ${i + 1}: ${lessonTitle}`,
      caption,
      equation: clean(b.equation, 240) || lessonEquation,
      mood,
      speechText,
      sceneState,
    });
  }

  while (normalizedList.length < 4) {
    const idx = normalizedList.length;
    const t = lastT < 0 ? 0 : lastT + 11;
    lastT = t;
    const fallbackCaptions = [
      `Planteamos la pregunta central de ${lessonTitle}.`,
      'Observamos cómo interactúan las variables en tiempo real.',
      'Conectamos la intuición visual con su expresión formal.',
      'Sintetizamos el criterio práctico para tomar mejores decisiones.',
    ];
    const caption = fallbackCaptions[idx % fallbackCaptions.length];
    normalizedList.push({
      t,
      title: `Paso ${idx + 1}`,
      caption,
      equation: lessonEquation,
      mood: moods[idx % moods.length],
      speechText: `${caption} ${lessonSummary}`,
      sceneState: defaultSceneState(renderer, lessonIndex + idx),
    });
  }
  return normalizedList;
}

function normalizeQuiz(rawQuiz, lessonTitle, lessonSummary) {
  const q = rawQuiz && typeof rawQuiz === 'object' ? rawQuiz : {};
  const question = clean(q.question, 260) || `¿Cuál es la idea clave que explica "${lessonTitle}"?`;
  let options = Array.isArray(q.options)
    ? q.options.map(opt => clean(String(opt), 200)).filter(Boolean).slice(0, 4)
    : [];
  const defaults = [
    clean(lessonSummary, 160) || 'Comprender la relación visual entre las variables del sistema.',
    'Ignorar la variación de parámetros y usar valores fijos.',
    'Evitar comprobar resultados mediante simulación interactiva.',
    'Aplicar una regla memorizada sin contexto del problema.',
  ];
  while (options.length < 4) options.push(defaults[options.length]);
  const rawIdx = Number(q.correctIndex);
  const correctIndex = Number.isInteger(rawIdx) && rawIdx >= 0 && rawIdx < options.length ? rawIdx : 0;
  const explanation = clean(q.explanation, 320) || `La respuesta correcta sintetiza el principio central: ${lessonSummary}`;
  return { question, options, correctIndex, explanation };
}

function slugify(value, maxLen = 48) {
  const base = normalized(value || '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen);
  return base || 'curso-ia';
}

export function normalizeCoursePayload(raw, defaults = {}) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const topic = clean(defaults.topic || data.topic, 240) || 'Fundamentos aplicados';
  const programSlug = defaults.programSlug !== undefined
    ? (programs.some(p => p.slug === defaults.programSlug) ? defaults.programSlug : null)
    : (programs.some(p => p.slug === data.programSlug) ? data.programSlug : null);
  const program = summarizeProgram(programSlug);
  const level = VALID_LEVELS.has(defaults.level)
    ? defaults.level
    : (VALID_LEVELS.has(data.level) ? data.level : 'Intermedio');
  const voiceId = VALID_VOICES.has(defaults.voiceId)
    ? defaults.voiceId
    : (VALID_VOICES.has(data.voiceId) ? data.voiceId : 'ef_dora');
  const targetLessons = Math.min(4, Math.max(3, Number(defaults.lessonCount) || 3));
  const primaryRenderer = RENDERER_SET.has(data.renderer)
    ? data.renderer
    : inferRendererFromTopic(topic, `${program?.title || ''} ${program?.area || ''}`);

  const rawLessons = Array.isArray(data.lessons) ? data.lessons.filter(l => l && typeof l === 'object') : [];
  const lessons = [];

  for (let i = 0; i < Math.min(4, Math.max(rawLessons.length, targetLessons)); i++) {
    if (i >= targetLessons && rawLessons.length <= targetLessons) break;
    const srcLesson = rawLessons[i];
    if (!srcLesson && lessons.length >= targetLessons) break;
    const l = srcLesson || {};
    const renderer = RENDERER_SET.has(l.renderer) ? l.renderer : primaryRenderer;
    const title = clean(l.title, 140) || `Lección ${i + 1}: ${topic}`;
    const summary = clean(l.summary, 320) || `Exploración visual e intuitiva de ${topic} aplicada paso a paso.`;
    const equation = clean(l.equation, 240) || (
      renderer === 'vector_space' ? 'T(\\vec{v}) = A\\vec{v}' :
      renderer === 'calculus_curve' ? "f'(x_0) = \\lim_{h\\to 0}\\frac{f(x_0+h)-f(x_0)}{h}" :
      renderer === 'neural_network' ? '\\hat{y} = \\sigma(w_1 x_1 + w_2 x_2 + b)' :
      renderer === 'probability_dist' ? 'P(H\\mid E) = \\frac{P(H)P(E\\mid H)}{P(E)}' :
      renderer === 'compound_growth' ? 'V_t = C_0(1+r)^t' :
      '\\text{Flujo}_{\\text{neto}} = \\Phi(\\text{carga},\\text{defensa},\\text{latencia})'
    );
    const beats = normalizeBeats(l.beats, title, summary, equation, renderer, i);
    const params = normalizeParams(l.params, renderer, beats[0]?.sceneState);
    const explorePrompt = clean(l.explorePrompt, 240)
      || 'Ajusta los deslizadores debajo del escenario para comprobar en vivo cómo responde el modelo.';
    lessons.push({
      id: clean(l.id, 60) || `leccion-${i + 1}`,
      title,
      summary,
      renderer,
      equation,
      explorePrompt,
      params,
      beats,
      quiz: normalizeQuiz(l.quiz, title, summary),
    });
  }

  const courseRenderer = lessons[0]?.renderer || primaryRenderer;
  const nowIso = defaults.createdAt || data.createdAt || new Date().toISOString();
  const id = clean(defaults.id || data.id, 80) || `${slugify(topic, 32)}-${crypto.randomUUID().slice(0, 8)}`;
  const slug = clean(defaults.slug || data.slug, 90) || id;

  return {
    id,
    slug,
    topic,
    title: clean(data.title, 150) || topic,
    subtitle: clean(data.subtitle, 280) || `Ruta visual interactiva sobre ${topic}${program ? ` · vinculada a ${program.shortTitle}` : ''}.`,
    programSlug,
    program,
    level,
    voiceId,
    source: defaults.source || data.source || 'generated',
    generationMode: defaults.generationMode || data.generationMode || null,
    renderer: courseRenderer,
    createdAt: nowIso,
    updatedAt: defaults.updatedAt || data.updatedAt || nowIso,
    lessons: lessons.slice(0, targetLessons),
  };
}

function buildTemplateCourse({ topic, programSlug, level, lessonCount, voiceId }) {
  const program = programs.find(p => p.slug === programSlug) || null;
  const baseRenderer = inferRendererFromTopic(topic, `${program?.title || ''} ${program?.area || ''}`);
  const secondaryRenderer = baseRenderer === 'system_flow' ? 'probability_dist' :
    baseRenderer === 'compound_growth' ? 'probability_dist' :
    baseRenderer === 'neural_network' ? 'calculus_curve' : baseRenderer;
  const subjects = program?.curriculum?.slice(0, 4) || [];
  const count = Math.min(4, Math.max(3, Number(lessonCount) || 3));

  const equationByRenderer = {
    vector_space: 'T(\\vec{v}) = \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}\\vec{v}, \\quad \\det(A)=ad-bc',
    calculus_curve: "f'(x_0) = \\lim_{h \\to 0}\\frac{f(x_0+h)-f(x_0)}{h}",
    neural_network: '\\hat{y} = \\sigma(w_1 x_1 + w_2 x_2 + b)',
    probability_dist: 'P(H\\mid E) = \\frac{P(H)\\,P(E\\mid H)}{P(E)}',
    compound_growth: 'V_t = C_0\\,(1 + r)^t',
    system_flow: 'E_{\\text{efectiva}} = \\text{Capacidad}\\times(1 - \\text{Riesgo}) - \\text{Fricción}',
  };

  const lessonBlueprints = [
    {
      focus: 'Intuición visual y mapa de fuerzas',
      renderer: baseRenderer,
      summary: `Construye el modelo mental central detrás de ${topic} observando cómo cada componente mueve el sistema completo.`,
      prompt: `Manipula los parámetros principales para observar en vivo la sensibilidad de ${topic}.`,
    },
    {
      focus: subjects[0] ? `Dinámica aplicada: ${subjects[0]}` : `Variables críticas y equilibrio en ${topic}`,
      renderer: baseRenderer,
      summary: `Analiza qué ocurre cuando las variables clave compiten o se amplifican dentro de ${topic}.`,
      prompt: 'Lleva uno de los parámetros hacia su extremo superior y observa qué indicador responde primero.',
    },
    {
      focus: subjects[1] ? `Decisión cuantitativa: ${subjects[1]}` : `De la teoría a la decisión en ${topic}`,
      renderer: secondaryRenderer,
      summary: `Evalúa escenarios bajo incertidumbre y conecta ${topic} con criterios verificables de decisión.`,
      prompt: 'Compara el escenario base frente al escenario optimizado ajustando los controles.',
    },
    {
      focus: subjects[2] ? `Integración ejecutiva: ${subjects[2]}` : `Arquitectura integral y casos reales de ${topic}`,
      renderer: baseRenderer,
      summary: `Consolida los aprendizajes en una visión sistémica aplicable a proyectos reales${program ? ` de ${program.shortTitle}` : ''}.`,
      prompt: 'Diseña tu propia configuración de equilibrio combinando todos los deslizadores.',
    },
  ];

  const lessons = lessonBlueprints.slice(0, count).map((bp, idx) => {
    const r = bp.renderer;
    const eq = equationByRenderer[r];
    const s0 = defaultSceneState(r, idx);
    const programHook = program
      ? ` Este enfoque se profundiza en la ${program.title} de la Universidad Casa Grande${program.cesResolution ? ` (resolución ${program.cesResolution})` : ''}.`
      : '';
    return {
      id: `tpl-l${idx + 1}`,
      title: `${idx + 1}. ${bp.focus}`,
      summary: bp.summary,
      renderer: r,
      equation: eq,
      explorePrompt: bp.prompt,
      params: defaultParamsFor(r, s0),
      beats: [
        {
          t: 0,
          title: 'La pregunta que abre la curiosidad',
          caption: `Por qué importa visualizar ${topic} antes de memorizar definiciones.`,
          equation: eq,
          mood: 'curious',
          speechText: `Bienvenido a esta lección sobre ${topic}. Antes de llenar la pizarra de reglas, observemos en pantalla la geometría y el movimiento que explican por qué este concepto funciona en la práctica.`,
          sceneState: defaultSceneState(r, idx),
        },
        {
          t: 11,
          title: 'Cambiar una palanca, ver todo el sistema',
          caption: 'Cada parámetro altera simultáneamente proporciones, pendientes o flujos.',
          equation: eq,
          mood: 'excited',
          speechText: `Fíjate en cómo responde el lienzo cuando modificamos una sola variable clave. Esa relación visual te permite anticipar comportamientos sin depender de cálculos a ciegas.`,
          sceneState: defaultSceneState(r, idx + 1),
        },
        {
          t: 22,
          title: 'El puente hacia el criterio cuantitativo',
          caption: 'La ecuación resume con precisión exacta lo que ya captó tu ojo.',
          equation: eq,
          mood: 'neutral',
          speechText: `Ahora sí, la expresión matemática que ves arriba cobra pleno sentido: traduce en símbolos ordenados exactamente la transformación que acabamos de seguir visualmente.${programHook}`,
          sceneState: defaultSceneState(r, idx + 2),
        },
        {
          t: 34,
          title: 'Explora y valida tu intuición',
          caption: 'Prueba casos límite en los deslizadores y comprueba lo aprendido abajo.',
          equation: eq,
          mood: 'emphatic',
          speechText: `El verdadero aprendizaje comienza cuando pones a prueba tus propias hipótesis. Mueve los controles del escenario y resuelve la pregunta de verificación al pie de la clase.`,
          sceneState: s0,
        },
      ],
      quiz: {
        question: `Al analizar "${bp.focus}", ¿qué ventaja ofrece observar la interacción dinámica entre parámetros?`,
        options: [
          'Permite entender relaciones de causa, sensibilidad y casos límite más allá de memorizar una fórmula',
          'Reemplaza por completo la necesidad de verificar datos reales',
          'Garantiza que todas las variables crezcan siempre de manera lineal',
          'Evita tener que definir objetivos claros de análisis',
        ],
        correctIndex: 0,
        explanation: 'La visualización interactiva revela cómo responde el sistema completo ante cambios en sus parámetros y facilita detectar casos límite.',
      },
    };
  });

  const titleTopic = topic.charAt(0).toUpperCase() + topic.slice(1);
  return {
    topic,
    title: program ? `${titleTopic} · Enfoque ${program.shortTitle}` : titleTopic,
    subtitle: program
      ? `Curso visual interactivo diseñado en torno a ${topic}, conectado con la malla verificada de ${program.title} (${brand.shortName}).`
      : `Clase visual interactiva estilo 3Blue1Brown para dominar ${topic} desde la intuición hasta la aplicación.`,
    programSlug: program?.slug || null,
    level,
    voiceId,
    renderer: baseRenderer,
    lessons,
  };
}

export async function ensureCourseTables(db) {
  if (!db) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS interactive_courses (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    topic TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    program_slug TEXT,
    level TEXT NOT NULL,
    voice_id TEXT NOT NULL DEFAULT 'ef_dora',
    source TEXT NOT NULL DEFAULT 'generated',
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  await db.prepare(
    'CREATE INDEX IF NOT EXISTS interactive_courses_created ON interactive_courses(created_at DESC)'
  ).run();
}

function hydrateDbRow(row) {
  if (!row) return null;
  let parsed = {};
  try {
    parsed = JSON.parse(row.payload_json || '{}');
  } catch {
    parsed = {};
  }
  return normalizeCoursePayload(parsed, {
    id: row.id,
    slug: row.slug,
    topic: row.topic,
    programSlug: row.program_slug || null,
    level: row.level,
    voiceId: row.voice_id,
    source: row.source || 'generated',
    lessonCount: Array.isArray(parsed.lessons) ? parsed.lessons.length : 3,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function listCourses(db) {
  const curated = CURATED_COURSES.map(c => normalizeCoursePayload(c, {
    id: c.id,
    slug: c.slug,
    topic: c.topic,
    programSlug: c.programSlug,
    level: c.level,
    voiceId: c.voiceId,
    source: 'curated',
    lessonCount: c.lessons.length,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  if (!db) return curated;
  await ensureCourseTables(db);
  const res = await db.prepare(
    `SELECT id, slug, topic, title, subtitle, program_slug, level, voice_id, source, payload_json, created_at, updated_at
     FROM interactive_courses
     ORDER BY created_at DESC, rowid DESC
     LIMIT 60`
  ).all();

  const generated = (res.results || []).map(hydrateDbRow).filter(Boolean);
  return [...generated, ...curated];
}

export async function getCourseById(db, id) {
  const key = clean(id, 140);
  if (!key) return null;

  const curatedHit = CURATED_COURSES.find(c => c.id === key || c.slug === key);
  if (curatedHit) {
    return normalizeCoursePayload(curatedHit, {
      id: curatedHit.id,
      slug: curatedHit.slug,
      topic: curatedHit.topic,
      programSlug: curatedHit.programSlug,
      level: curatedHit.level,
      voiceId: curatedHit.voiceId,
      source: 'curated',
      lessonCount: curatedHit.lessons.length,
      createdAt: curatedHit.createdAt,
      updatedAt: curatedHit.updatedAt,
    });
  }

  if (!db) return null;
  await ensureCourseTables(db);
  const row = await db.prepare(
    `SELECT id, slug, topic, title, subtitle, program_slug, level, voice_id, source, payload_json, created_at, updated_at
     FROM interactive_courses
     WHERE id = ? OR slug = ?
     LIMIT 1`
  ).bind(key, key).first();

  return hydrateDbRow(row);
}

function parseAiCourseJson(rawText) {
  const text = String(rawText || '').trim();
  const stripped = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1));
    }
    throw new Error('JSON inválido devuelto por el modelo.');
  }
}

export async function generateInteractiveCourse(db, env = {}, input = {}) {
  const rawTopic = clean(input.topic, 240);
  if (!rawTopic || rawTopic.length < 3) {
    const err = new Error('Indica un tema de al menos 3 caracteres para generar el curso interactivo.');
    err.status = 422;
    throw err;
  }

  const safeTopic = redact(rawTopic);
  const requestedProgramSlug = clean(input.programSlug, 140);
  const matchedProgram = requestedProgramSlug ? programs.find(p => p.slug === requestedProgramSlug) || null : null;
  const programSlug = matchedProgram ? matchedProgram.slug : null;
  const level = VALID_LEVELS.has(input.level) ? input.level : 'Intermedio';
  const lessonCount = Math.min(4, Math.max(3, Number.parseInt(input.lessonCount, 10) || 3));
  const voiceId = VALID_VOICES.has(input.voiceId) ? input.voiceId : 'ef_dora';

  let mode = 'plantilla';
  let rawCourse = null;
  const aiVendor = activeAI(env || {});

  if (aiVendor) {
    const systemPrompt = [
      'Eres diseñador pedagógico y director de animaciones matemáticas estilo 3Blue1Brown para UCG Aula Interactiva IA (Universidad Casa Grande, Guayaquil, Ecuador).',
      'Crea un curso visual en español claro y ejecutivo que privilegie intuición geométrica antes de la fórmula.',
      `Usa EXCLUSIVAMENTE estos 6 renderers y varía los renderers entre lecciones: ${RENDERERS.join(', ')}.`,
      'Parámetros canónicos exactos por renderer:',
      '- vector_space: a, b, c, d',
      '- calculus_curve: x0, h, n (sceneState.mode en derivative | integral | gradient)',
      '- neural_network: w1, w2, bias, inputA (sceneState.stage en forward | boundary | loss | backprop)',
      '- probability_dist: prior, sensitivity, falsePos (sceneState.mode bayes) o mu, sigma (sceneState.mode gaussian)',
      '- compound_growth: capital, rate, years',
      '- system_flow: throughput, defense, latency (sceneState.activeNode 0..5)',
      'Si recibes datos de una maestría UCG, ancla ejemplos solo en esos hechos verificados (no inventes precios si inversion es null).',
      'Responde SOLO con JSON válido puro (sin ```json ni texto extra): {"title":"<=80 chars","subtitle":"<=140 chars","renderer":"...","lessons":[...]} con exactamente ' + lessonCount + ' lecciones.',
      'Mantén el JSON compacto para no exceder tokens: cada lección con id, title, summary (1 frase), renderer, equation (LaTeX), explorePrompt (1 frase), params (2-3 objetos {id,label,min,max,step,default,unit}), exactamente 4 beats ({t,title,caption (<=16 palabras),equation,mood (neutral|curious|excited|emphatic),speechText (22-38 palabras naturales en español),sceneState}), y quiz ({question,options(4 cortas),correctIndex,explanation (1 frase)}).',
    ].join('\n');

    const userPrompt = JSON.stringify({
      tema: safeTopic,
      nivel: level,
      numeroLecciones: lessonCount,
      vozId: voiceId,
      maestriaUcg: matchedProgram ? {
        slug: matchedProgram.slug,
        titulo: matchedProgram.title,
        area: matchedProgram.area,
        modalidad: matchedProgram.mode,
        duracion: matchedProgram.duration,
        resolucionCes: matchedProgram.cesResolution || null,
        dobleTitulacion: matchedProgram.doubleDegree || null,
        asignaturas: (matchedProgram.curriculum || []).slice(0, 6),
        inversionUsd: matchedProgram.price ?? null,
      } : null,
    });

    try {
      const aiRaw = await aiText(env, systemPrompt, userPrompt, 8000, { timeoutMs: 55000, effort: 'low' });
      rawCourse = parseAiCourseJson(aiRaw);
      if (rawCourse && Array.isArray(rawCourse.lessons) && rawCourse.lessons.length) {
        mode = aiVendor;
      } else {
        rawCourse = null;
      }
    } catch (err) {
      console.warn('course-studio ai fallback:', err?.message || 'Error');
      rawCourse = null;
      mode = 'plantilla';
    }
  }

  if (!rawCourse) {
    rawCourse = buildTemplateCourse({
      topic: safeTopic,
      programSlug,
      level,
      lessonCount,
      voiceId,
    });
    mode = 'plantilla';
  }

  const nowIso = new Date().toISOString();
  const id = `${slugify(safeTopic, 32)}-${crypto.randomUUID().slice(0, 8)}`;
  const course = normalizeCoursePayload(rawCourse, {
    id,
    slug: id,
    topic: safeTopic,
    programSlug,
    level,
    voiceId,
    source: mode === 'plantilla' ? 'template' : 'generated',
    generationMode: mode,
    lessonCount,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  if (db) {
    await ensureCourseTables(db);
    await db.prepare(
      `INSERT INTO interactive_courses(
        id, slug, topic, title, subtitle, program_slug, level, voice_id, source, payload_json, created_at, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      course.id,
      course.slug,
      course.topic,
      course.title,
      course.subtitle,
      course.programSlug,
      course.level,
      course.voiceId,
      course.source,
      JSON.stringify(course),
      course.createdAt,
      course.updatedAt
    ).run();
  }

  return { ok: true, mode, course };
}
