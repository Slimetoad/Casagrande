import test from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteD1 } from '../server/d1-sqlite.mjs';
import { handleHttpRequest } from '../server/index.mjs';
import {
  CURATED_COURSES,
  RENDERERS,
  ensureCourseTables,
  generateInteractiveCourse,
  getCourseById,
  inferTopicProfile,
  listCourses,
  normalizeCoursePayload,
} from '../src/course-studio.js';

const RENDERER_SET = new Set(RENDERERS);
const QUAL_RENDERERS = new Set(['concept_map', 'timeline_arc', 'tension_matrix']);
const VALID_MOODS = new Set(['neutral', 'curious', 'excited', 'emphatic']);

test('CURATED_COURSES cumple esquema completo de 6 cursos, 3 lecciones, renderers y quizzes', () => {
  assert.equal(CURATED_COURSES.length, 6);
  assert.deepEqual(RENDERERS, [
    'vector_space',
    'calculus_curve',
    'neural_network',
    'probability_dist',
    'compound_growth',
    'system_flow',
    'concept_map',
    'timeline_arc',
    'tension_matrix',
  ]);

  const seenIds = new Set();
  for (const course of CURATED_COURSES) {
    assert.ok(course.id && !seenIds.has(course.id), `id duplicado o vacío: ${course.id}`);
    seenIds.add(course.id);
    assert.equal(course.lessons.length, 3, `curso ${course.id} debe tener 3 lecciones`);
    assert.ok(RENDERER_SET.has(course.renderer), `renderer inválido en ${course.id}`);
    assert.equal(course.source, 'curated');

    for (const lesson of course.lessons) {
      assert.ok(lesson.id && lesson.title && lesson.summary);
      assert.ok(RENDERER_SET.has(lesson.renderer), `renderer inválido en ${lesson.id}`);
      assert.ok(typeof lesson.equation === 'string' && lesson.equation.length > 0);
      assert.ok(typeof lesson.explorePrompt === 'string' && lesson.explorePrompt.length > 10);
      assert.ok(Array.isArray(lesson.params) && lesson.params.length >= 2);
      for (const p of lesson.params) {
        assert.ok(p.id && p.label);
        assert.ok(Number.isFinite(p.min) && Number.isFinite(p.max) && p.max > p.min);
        assert.ok(Number.isFinite(p.step) && p.step > 0);
        assert.ok(p.default >= p.min && p.default <= p.max);
      }

      assert.ok(Array.isArray(lesson.beats) && lesson.beats.length >= 4 && lesson.beats.length <= 5);
      let prevT = -1;
      for (const beat of lesson.beats) {
        assert.ok(beat.t > prevT, `timestamps no crecientes en ${lesson.id}`);
        prevT = beat.t;
        assert.ok(beat.title && beat.caption && beat.equation && beat.speechText);
        assert.ok(VALID_MOODS.has(beat.mood), `mood inválido: ${beat.mood}`);
        assert.ok(beat.sceneState && typeof beat.sceneState === 'object');
      }

      assert.ok(lesson.quiz && lesson.quiz.question);
      assert.equal(lesson.quiz.options.length, 4);
      assert.ok(Number.isInteger(lesson.quiz.correctIndex));
      assert.ok(lesson.quiz.correctIndex >= 0 && lesson.quiz.correctIndex < 4);
      assert.ok(lesson.quiz.explanation.length > 10);
    }
  }

  assert.equal(CURATED_COURSES[0].programSlug, null);
  assert.equal(CURATED_COURSES[1].programSlug, 'maestria-en-ia-y-ciencia-de-datos');
  assert.equal(CURATED_COURSES[2].programSlug, null);
  assert.equal(CURATED_COURSES[3].programSlug, 'maestria-en-administracion-de-empresas');
  assert.equal(CURATED_COURSES[4].programSlug, 'maestria-en-administracion-de-empresas');
  assert.equal(CURATED_COURSES[5].programSlug, 'maestria-en-ciberseguridad');
});

test('generateInteractiveCourse en modo plantilla persiste en SQLite y ordena los generados más recientes primero', async t => {
  const db = openSqliteD1(':memory:');
  t.after(() => db.close());

  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM _migrations').get().n, 6);
  await ensureCourseTables(db);

  const first = await generateInteractiveCourse(db, {}, {
    topic: 'Valoración de empresas y flujo de caja descontado',
    programSlug: 'maestria-en-administracion-de-empresas',
    level: 'Ejecutivo',
    lessonCount: 3,
    voiceId: 'ef_dora',
  });
  assert.equal(first.ok, true);
  assert.equal(first.mode, 'plantilla');
  assert.equal(first.course.lessons.length, 3);
  assert.equal(first.course.programSlug, 'maestria-en-administracion-de-empresas');
  assert.ok(first.course.program?.title.includes('Administración de Empresas'));
  assert.equal(first.course.renderer, 'compound_growth');

  // Slight timestamp offset via second course
  await new Promise(resolve => setTimeout(resolve, 10));

  const second = await generateInteractiveCourse(db, {}, {
    topic: 'Arquitectura Zero Trust y cifrado TLS',
    programSlug: 'maestria-en-ciberseguridad',
    level: 'Avanzado',
    lessonCount: 4,
    voiceId: 'em_alex',
  });
  assert.equal(second.ok, true);
  assert.equal(second.mode, 'plantilla');
  assert.equal(second.course.lessons.length, 4);
  assert.equal(second.course.voiceId, 'em_alex');
  assert.equal(second.course.renderer, 'system_flow');

  const courses = await listCourses(db);
  assert.equal(courses.length, 8);
  assert.equal(courses[0].id, second.course.id);
  assert.equal(courses[1].id, first.course.id);

  const fetched = await getCourseById(db, first.course.id);
  assert.equal(fetched.title, first.course.title);
  assert.equal(fetched.lessons.length, 3);
});

test('generateInteractiveCourse con Claude mockeado redacta PII, normaliza respuesta IA y guarda en SQLite', async t => {
  const db = openSqliteD1(':memory:');
  t.after(() => db.close());

  let capturedBody = null;
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    capturedBody = JSON.parse(opts.body);
    return Response.json({
      stop_reason: 'end_turn',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            title: 'Transformadas Lineales en Ciencia de Datos',
            subtitle: 'De proyecciones geométricas a reducción de dimensionalidad.',
            renderer: 'vector_space',
            lessons: [
              {
                id: 'cl-l1',
                title: 'Proyecciones y matrices',
                summary: 'Cómo una matriz proyecta vectores hacia subespacios útiles.',
                renderer: 'renderer_inexistente_que_se_repara',
                equation: 'P = A(A^T A)^{-1}A^T',
                explorePrompt: 'Mueve a y d para escalar la proyección.',
                beats: [
                  {
                    t: 0,
                    title: 'Proyectar sombra',
                    caption: 'La sombra conserva la dirección principal.',
                    equation: '\\vec{p} = \\text{proj}_{\\vec{u}}(\\vec{v})',
                    mood: 'curious',
                    speechText: 'Imagina la sombra de una flecha sobre una recta.',
                    sceneState: { a: 1.3, b: 0.2, c: 0.1, d: 0.9 },
                  },
                  {
                    t: 10,
                    title: 'Ortogonalidad',
                    caption: 'El error es perpendicular al subespacio.',
                    equation: '(\\vec{v}-\\vec{p})\\cdot\\vec{u}=0',
                    mood: 'emphatic',
                    speechText: 'El residuo siempre forma ángulo recto con la base.',
                  },
                ],
                quiz: {
                  question: '¿Qué ángulo forma el error de proyección con la recta base?',
                  options: ['90 grados', '45 grados', '180 grados', '0 grados'],
                  correctIndex: 0,
                  explanation: 'La distancia mínima al subespacio es ortogonal.',
                },
              },
            ],
          }),
        },
      ],
    });
  });

  const env = {
    LLM_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    ANTHROPIC_MODEL: 'claude-sonnet-4-5',
  };

  const result = await generateInteractiveCourse(db, env, {
    topic: 'Álgebra lineal para juan.perez@example.com 0991234567',
    programSlug: 'maestria-en-ia-y-ciencia-de-datos',
    level: 'Intermedio',
    lessonCount: 3,
    voiceId: 'em_santa',
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'anthropic');
  assert.equal(result.course.title, 'Transformadas Lineales en Ciencia de Datos');
  assert.equal(result.course.lessons.length, 3);
  assert.equal(result.course.lessons[0].renderer, 'vector_space');
  assert.equal(result.course.lessons[0].beats.length, 4);
  assert.ok(result.course.lessons[0].params.some(p => p.id === 'a'));

  const sentUser = capturedBody.messages[0].content;
  assert.ok(!sentUser.includes('juan.perez@example.com'));
  assert.ok(!sentUser.includes('0991234567'));
  assert.ok(sentUser.includes('[correo omitido]'));
});

test('rutas HTTP /api/public/courses* listan, consultan, generan y aplican CORS', async t => {
  const db = openSqliteD1(':memory:');
  t.after(() => db.close());

  const env = {
    DB: db,
    PUBLIC_BASE_URL: 'https://slimetoad.github.io/Casagrande',
  };

  const listRes = await handleHttpRequest(
    new Request('https://api.example.test/api/public/courses', {
      headers: { Origin: 'https://slimetoad.github.io' },
    }),
    env,
  );
  assert.equal(listRes.status, 200);
  assert.equal(listRes.headers.get('Access-Control-Allow-Origin'), 'https://slimetoad.github.io');
  const listData = await listRes.json();
  assert.equal(listData.ok, true);
  assert.equal(listData.courses.length, 6);
  assert.equal(listData.programs.length, 34);

  const headRes = await handleHttpRequest(
    new Request('https://api.example.test/api/public/courses', { method: 'HEAD' }),
    env,
  );
  assert.equal(headRes.status, 200);
  assert.equal(await headRes.text(), '');

  const getCurated = await handleHttpRequest(
    new Request('https://api.example.test/api/public/courses/algebra-lineal-visual'),
    env,
  );
  assert.equal(getCurated.status, 200);
  const curatedJson = await getCurated.json();
  assert.equal(curatedJson.course.id, 'algebra-lineal-visual');

  const notFound = await handleHttpRequest(
    new Request('https://api.example.test/api/public/courses/no-existe-123'),
    env,
  );
  assert.equal(notFound.status, 404);

  const badOrigin = await handleHttpRequest(
    new Request('https://api.example.test/api/public/courses/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example.com',
      },
      body: JSON.stringify({ topic: 'Cálculo' }),
    }),
    env,
  );
  assert.equal(badOrigin.status, 403);

  const emptyTopic = await handleHttpRequest(
    new Request('https://api.example.test/api/public/courses/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: ' ' }),
    }),
    env,
  );
  assert.equal(emptyTopic.status, 422);

  const genRes = await handleHttpRequest(
    new Request('https://api.example.test/api/public/courses/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://slimetoad.github.io',
      },
      body: JSON.stringify({
        topic: 'Teorema de Bayes en marketing digital',
        programSlug: 'maestria-en-marketing-estrategico',
        level: 'Intermedio',
        lessonCount: 3,
        voiceId: 'ef_dora',
      }),
    }),
    env,
  );
  assert.equal(genRes.status, 201);
  assert.equal(genRes.headers.get('Access-Control-Allow-Origin'), 'https://slimetoad.github.io');
  const genJson = await genRes.json();
  assert.equal(genJson.ok, true);
  assert.equal(genJson.mode, 'plantilla');
  assert.equal(genJson.course.renderer, 'probability_dist');

  const fetchGenerated = await handleHttpRequest(
    new Request(`https://api.example.test/api/public/courses/${encodeURIComponent(genJson.course.id)}`),
    env,
  );
  assert.equal(fetchGenerated.status, 200);
  const fetchedJson = await fetchGenerated.json();
  assert.equal(fetchedJson.course.id, genJson.course.id);
});

test('temas cualitativos (Geopolítica de América Latina) usan renderers conceptuales sin LaTeX y STEM conserva vector_space', async t => {
  const db = openSqliteD1(':memory:');
  t.after(() => db.close());

  assert.equal(inferTopicProfile('Geopolítica de América Latina'), 'qualitative');
  assert.equal(inferTopicProfile('Álgebra Lineal'), 'quantitative');
  assert.equal(inferTopicProfile('Derecho Constitucional y Políticas Públicas'), 'qualitative');

  const tplGeo = await generateInteractiveCourse(db, {}, {
    topic: 'Geopolítica de América Latina',
    level: 'Intermedio',
    lessonCount: 3,
    voiceId: 'ef_dora',
  });
  assert.equal(tplGeo.ok, true);
  assert.equal(tplGeo.mode, 'plantilla');
  assert.ok(QUAL_RENDERERS.has(tplGeo.course.renderer));
  for (const lesson of tplGeo.course.lessons) {
    assert.ok(QUAL_RENDERERS.has(lesson.renderer), `renderer no cualitativo: ${lesson.renderer}`);
    assert.ok(!/\\(?:vec|frac|det|sigma|lim)|=/.test(lesson.equation), `LaTeX no esperado: ${lesson.equation}`);
    for (const beat of lesson.beats) {
      assert.ok(!/\\(?:vec|frac|det|sigma|lim)|=/.test(beat.equation), `LaTeX en beat no esperado: ${beat.equation}`);
    }
  }

  const tplAlg = await generateInteractiveCourse(db, {}, {
    topic: 'Álgebra Lineal',
    level: 'Introductorio',
    lessonCount: 3,
    voiceId: 'em_alex',
  });
  assert.equal(tplAlg.course.renderer, 'vector_space');

  let capturedPrompt = null;
  t.mock.method(globalThis, 'fetch', async (_url, opts) => {
    capturedPrompt = JSON.parse(opts.body);
    return Response.json({
      stop_reason: 'end_turn',
      content: [{
        type: 'text',
        text: JSON.stringify({
          title: 'Geopolítica de América Latina Contemporánea',
          subtitle: 'Actores regionales, alianzas comerciales y equilibrio multipolar.',
          renderer: 'concept_map',
          lessons: [
            {
              id: 'geo-l1',
              title: 'Mapa de bloques regionales',
              summary: 'Cómo interactúan Mercosur, Alianza del Pacífico y potencias externas.',
              renderer: 'concept_map',
              equation: 'Autonomía estratégica ↔ Integración pragmática en orden multipolar',
              explorePrompt: 'Mueve cohesión y tensión para simular alineamientos regionales.',
              beats: [
                {
                  t: 0,
                  title: 'Actores principales',
                  caption: 'Seis actores definen el equilibrio suramericano.',
                  equation: 'Autonomía estratégica ↔ Integración pragmática',
                  mood: 'curious',
                  speechText: 'Analizamos la constelación de bloques y potencias en la región.',
                  sceneState: {
                    activeNode: 0,
                    scenarioLabel: 'Tablero latinoamericano',
                    nodes: ['Brasil', 'México', 'Alianza del Pacífico', 'Mercosur', 'EE. UU.', 'China'],
                    links: [{ from: 0, to: 3, label: 'Liderazgo', tone: 'ally' }],
                  },
                },
                {
                  t: 11,
                  title: 'Giro comercial',
                  caption: 'El peso asiático modifica cadenas de suministro.',
                  equation: 'Comercio de recursos vs. manufactura regional',
                  mood: 'excited',
                  speechText: 'China emerge como socio comercial clave en Sudamérica.',
                  sceneState: { activeNode: 5, cohesion: 50, tension: 60 },
                },
              ],
              quiz: {
                question: '¿Qué describe mejor el concepto de no alineamiento activo?',
                options: [
                  'Cooperar pragmáticamente con múltiples polos preservando autonomía',
                  'Aislarse de todo tratado comercial',
                  'Delegar la política exterior a un único bloque',
                  'Rechazar organismos multilaterales',
                ],
                correctIndex: 0,
                explanation: 'Permite negociar con diversos socios según intereses estratégicos.',
              },
            },
            {
              id: 'geo-l2',
              title: 'Hitos del regionalismo',
              summary: 'De la CEPAL al siglo XXI.',
              renderer: 'timeline_arc',
              equation: 'Trayectoria de integración y fragmentación latinoamericana',
              beats: [
                {
                  t: 0,
                  title: 'Orígenes',
                  caption: 'Primeros acuerdos de posguerra.',
                  equation: 'De la sustitución de importaciones a bloques abiertos',
                  mood: 'curious',
                  speechText: 'Recorremos cinco décadas de integración.',
                  sceneState: {
                    activeMilestone: 0,
                    milestones: [
                      { era: '1969', title: 'Pacto Andino', detail: 'Acuerdo de Cartagena.' },
                      { era: '1991', title: 'Mercosur', detail: 'Tratado de Asunción.' },
                      { era: '2011', title: 'Alianza del Pacífico', detail: 'Integración profunda.' },
                      { era: '2020', title: 'Reconfiguración', detail: 'Cadenas regionales.' },
                      { era: 'Hoy', title: 'Multipolaridad', detail: 'Transición energética.' },
                    ],
                  },
                },
                {
                  t: 12,
                  title: 'Siglo XXI',
                  caption: 'Nuevos polos comerciales.',
                  equation: 'Energía y litio en la agenda global',
                  mood: 'neutral',
                  speechText: 'Los minerales críticos revalorizan la región.',
                  sceneState: { activeMilestone: 4 },
                },
              ],
            },
            {
              id: 'geo-l3',
              title: 'Dilemas estratégicos',
              summary: 'Autonomía frente a integración.',
              renderer: 'tension_matrix',
              equation: 'Soberanía regulatoria ↔ Convergencia de mercado',
              beats: [
                {
                  t: 0,
                  title: 'Cuadrantes',
                  caption: 'Cuatro rutas posibles de política exterior.',
                  equation: 'Soberanía regulatoria ↔ Convergencia',
                  mood: 'emphatic',
                  speechText: 'Contrastamos horizontes cortos y de Estado.',
                  sceneState: {
                    xAxis: 'Autonomía ↔ Integración',
                    yAxis: 'Coyuntura ↔ Visión de Estado',
                    quadrants: ['Q1', 'Q2', 'Q3', 'Q4'],
                    items: [{ label: 'Corredor bioceánico', x: 75, y: 78 }],
                    focusItem: 0,
                  },
                },
                {
                  t: 12,
                  title: 'Equilibrio',
                  caption: 'Ajuste bajo presión global.',
                  equation: 'Equilibrio bajo presión externa',
                  mood: 'neutral',
                  speechText: 'La presión externa desplaza el punto de balance.',
                  sceneState: { axisX: 68, axisY: 72 },
                },
              ],
            },
          ],
        }),
      }],
    });
  });

  const aiGeo = await generateInteractiveCourse(db, {
    LLM_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_MODEL: 'claude-sonnet-4-5',
  }, {
    topic: 'Geopolítica de América Latina',
    level: 'Ejecutivo',
    lessonCount: 3,
    voiceId: 'em_santa',
  });

  assert.equal(aiGeo.mode, 'anthropic');
  assert.ok(capturedPrompt.messages[0].content.includes('"perfilSugerido":"qualitative"'));
  assert.equal(aiGeo.course.lessons[0].renderer, 'concept_map');
  assert.equal(aiGeo.course.lessons[1].renderer, 'timeline_arc');
  assert.equal(aiGeo.course.lessons[2].renderer, 'tension_matrix');
  for (const lesson of aiGeo.course.lessons) {
    assert.ok(!/\\(?:vec|frac|det|sigma|lim)|=/.test(lesson.equation));
  }

  // Verify beat-0 structural inheritance into beats 1-3 via normalizeCoursePayload
  const l0 = aiGeo.course.lessons[0];
  assert.deepEqual(l0.beats[1].sceneState.nodes, ['Brasil', 'México', 'Alianza del Pacífico', 'Mercosur', 'EE. UU.', 'China']);
  assert.deepEqual(l0.beats[3].sceneState.nodes, ['Brasil', 'México', 'Alianza del Pacífico', 'Mercosur', 'EE. UU.', 'China']);
  assert.equal(aiGeo.course.lessons[1].beats[1].sceneState.milestones[0].era, '1969');
  assert.deepEqual(aiGeo.course.lessons[2].beats[1].sceneState.quadrants, ['Q1', 'Q2', 'Q3', 'Q4']);

  // Also test standalone normalizeCoursePayload defense against quantitative renderer leak on qualitative profile
  const repaired = normalizeCoursePayload({
    title: 'Historia Diplomática',
    renderer: 'vector_space',
    lessons: [{ title: 'Evolución diplomática', renderer: 'calculus_curve' }],
  }, { topic: 'Historia de la diplomacia latinoamericana', topicProfile: 'qualitative', lessonCount: 3 });
  assert.ok(QUAL_RENDERERS.has(repaired.renderer));
  assert.ok(QUAL_RENDERERS.has(repaired.lessons[0].renderer));
});
