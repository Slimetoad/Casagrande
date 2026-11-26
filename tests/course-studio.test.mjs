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
  listCourses,
} from '../src/course-studio.js';

const RENDERER_SET = new Set(RENDERERS);
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
