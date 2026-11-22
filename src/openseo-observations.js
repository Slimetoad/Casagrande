// Observaciones públicas del Keyword Generator, con Ecuador seleccionado el 22 de noviembre de 2026.
const lists = [
  [null, [
    ['maestrías en línea ecuador', 90, 29],
    ['becas para maestrías en línea', 10, null],
    ['universidades con maestrías en línea', 10, null],
    ['maestrías en línea económicas', 10, null]
  ]],
  ['maestria-en-ia-y-ciencia-de-datos', [
    ['maestría en inteligencia artificial', 720, 0],
    ['maestría en inteligencia artificial ecuador', 90, null],
    ['maestría en inteligencia artificial aplicada', 50, null],
    ['maestría en ciencias de datos e inteligencia artificial', 30, null],
    ['maestría en inteligencia artificial online', 30, null],
    ['maestría en inteligencia artificial precio', 10, null]
  ]],
  ['educacion-inclusiva', [
    ['maestría en educación inclusiva', 50, null],
    ['maestría en educación inclusiva con mención en intervención psicoeducativa', 20, null],
    ['maestría en educación inclusiva e intercultural', 10, null]
  ]],
  ['maestria-en-administracion-de-empresas', [
    ['maestría en administración de empresas ecuador', 30, 53],
    ['maestría en administración de empresas mba', 10, null],
    ['cuanto dura una maestría en administración de empresas', 10, null],
    ['maestría en administración de empresas en línea', 10, null]
  ]]
]

export const publicKeywordObservations = lists.flatMap(([program, rows]) => rows.map(([keyword, volume, difficulty]) => ({
  program, keyword, volume, difficulty, observedAt: '2026-11-22',
  sourceUrl: 'https://openseo.so/keyword-generator', market: 'Ecuador', source: 'OpenSEO · Keyword Generator'
})))
