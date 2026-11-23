# Demo de producto en movimiento

Video de unos dos minutos que muestra el recorrido del aspirante y cómo el sitio, el motor de
contenidos y el CRM con agentes ayudan a captar y convertir. Las escenas de pantalla son
grabaciones reales del portal público y del CRM de muestra; el movimiento, los títulos y los
diagramas están hechos en HTML con GSAP y se renderizan cuadro por cuadro.

## Cómo se produce

1. `capture.mjs` graba cada recorrido con Playwright sobre el sitio publicado
   (`BASE_URL`, por defecto el portal de posgrados). Los guiones solo leen o previsualizan:
   no envían formularios, no crean citas ni consultas, y el CRM se usa en su modo de
   demostración con datos ficticios.
2. `render.mjs` mide cada grabación (duración y primer cuadro pintado para recortar la
   carga de la página), abre `index.html` y avanza el cronograma a 30 fps. En cada cuadro
   busca el instante exacto de cada grabación y envía la captura a `ffmpeg`.
3. `index.html`, `demo.js` y `demo.css` contienen toda la composición: escenas, textos,
   transiciones y las cifras de los diagramas.

## Uso

```sh
cd demo/product-demo
npm install                       # gsap y playwright (usa el Chromium del sistema si CHROMIUM_PATH está definido)
BASE_URL=https://casa-grande-posgrados.francisco.chatgpt.site npm run capture
npm run render                    # build/product-demo.mp4 (1920×1080, 30 fps, H.264)
node render.mjs --still 12,60,110 # fotogramas PNG para revisar sin renderizar todo
```

Requisitos: `ffmpeg` y `ffprobe` en el PATH, y un Chromium compatible con Playwright.
Las grabaciones y el video quedan en `build/`, que no se versiona.

## Dónde cambiar el contenido

- **Textos y ritmo**: el arreglo `plan` al final de `demo.js` define el orden de las escenas,
  su duración, el número del capítulo, la ruta mostrada y el pie de cada grabación.
- **Escenas de pantalla**: `scenarios` en `capture.mjs`. Cada entrada es un recorrido.
  Para grabar solo algunas: `node capture.mjs catalog chat`.
- **Velocidad de las grabaciones**: `RATE` en `demo.js` (1.3 por defecto) y `TAIL`.
- **Colores y tipografía**: `demo.css`, con los tokens de la marca (naranja `#ff8300`,
  carbón `#1e2324`, crema `#f7f4ee`) y las fuentes de `public/media`.

## Qué afirma el video

Cada afirmación del video procede del código o del texto publicado del portal:

- 34 maestrías en 7 áreas, con fichas que enlazan a su fuente oficial.
- El asistente responde con el catálogo y dice cuando un dato aún no está publicado.
- El simulador calcula la cuota con la cotización que ingresa el usuario.
- Los permisos de correo, WhatsApp y llamadas son opcionales y se piden por separado.
- La puntuación de oportunidades usa demanda 50, interés del CRM 25 y brecha de contenido 25
  (`src/editorial-engine.js`).
- Las guías pasan por revisión del equipo antes de publicarse.
- Seguimiento con un máximo de dos mensajes por semana, 24 horas entre envíos y bajas
  respetadas (`src/conversation-nurture.js`).
- La matrícula exige evidencia en el expediente.

El video no muestra cifras de resultados. El repositorio no contiene mediciones de conversión
atribuibles al producto, y el propio tablero de captación advierte que sus columnas no prueban
causalidad. Los datos del CRM son ficticios (modo de demostración). Las cifras de búsqueda del
motor de contenidos son las del sitio publicado en el momento de la grabación; no son resultados de
conversión. Si la universidad tiene resultados medidos, pueden añadirse como una escena aparte
con su fuente y su periodo.

## Narración

`narrate.py` locuta el texto de `narration/lines.json` con Kokoro (voz `ef_dora`, español) y
añade la pista al video sin volver a renderizar las imágenes:

```sh
python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile huggingface_hub numpy
.venv/bin/python narrate.py       # build/product-demo-narrated.mp4
```

Los modelos se descargan de `onnx-community/Kokoro-82M-v1.0-ONNX` en Hugging Face y quedan en
`build/kokoro/`. Cada línea tiene su hora de inicio en segundos. El script avisa si una línea
supera su escena o se solapa con la siguiente. No hay música.

## Pendiente

- La narración se generó sin escucharla. Conviene revisarla en el video, sobre todo los
  nombres propios y las siglas (CRM, WhatsApp).
- El texto está en español, como la interfaz grabada. Una versión en inglés requiere cambiar los
  textos de `plan` en `demo.js` y `narration/lines.json`; las grabaciones seguirían en español.
