#!/usr/bin/env python3
"""Renderizador batch de clases con avatar fotorrealista para UCG Aula Interactiva IA.

Complemento offline/servidor del avatar WebGL en vivo del navegador (`/aula/`).
Combina:
  1. El audio en español generado y descargado con Kokoro-82M (`.wav`).
  2. El guion estructurado exportado desde Aula IA (`.json` con lecciones y beats).
  3. Una imagen o video retrato base del docente (`--source-image`).
  4. Motor open-source de sincronización labial: MuseTalk 1.5 (preferido) o LivePortrait,
     más FFmpeg para muxing H.264 y subtítulos `.srt` sincronizados por beat.

Requisitos previos (entorno GPU Linux/macOS):
  - Python 3.10+ y FFmpeg en PATH (`ffmpeg -version`).
  - MuseTalk 1.5: https://github.com/TMElyralab/MuseTalk
      git clone https://github.com/TMElyralab/MuseTalk.git
      pip install -r MuseTalk/requirements.txt
  - o LivePortrait: https://github.com/KwaiVGI/LivePortrait
      git clone https://github.com/KwaiVGI/LivePortrait.git

Ejemplo (simulación segura sin GPU):
  python3 scripts/render-avatar-lesson.py \\
    --course-json curso-ucg.json \\
    --audio-wav leccion-ucg.wav \\
    --source-image docente.png \\
    --output clase-final.mp4 \\
    --engine musetalk \\
    --dry-run
"""

from __future__ import annotations

import argparse
import json
import shlex
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


def format_srt_timestamp(seconds: float) -> str:
    """Convierte segundos flotantes a formato SRT `HH:MM:SS,mmm`."""
    clamped = max(0.0, float(seconds))
    total_ms = int(round(clamped * 1000))
    hours = total_ms // 3_600_000
    minutes = (total_ms % 3_600_000) // 60_000
    secs = (total_ms % 60_000) // 1000
    millis = total_ms % 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def extract_lesson(payload: dict[str, Any], lesson_index: int) -> dict[str, Any]:
    """Obtiene la lección objetivo desde un JSON de curso completo o de lección única."""
    if isinstance(payload.get("lessons"), list) and payload["lessons"]:
        lessons = payload["lessons"]
        if lesson_index < 0 or lesson_index >= len(lessons):
            raise ValueError(
                f"lesson-index {lesson_index} fuera de rango (0..{len(lessons) - 1})."
            )
        lesson = lessons[lesson_index]
        if not isinstance(lesson, dict):
            raise ValueError("La lección seleccionada no es un objeto JSON válido.")
        return lesson

    if isinstance(payload.get("beats"), list):
        return payload

    raise ValueError(
        "El archivo JSON debe contener 'lessons' (exportado desde /aula/) o 'beats'."
    )


def build_srt_from_beats(beats: list[dict[str, Any]], default_duration: float = 10.0) -> str:
    """Construye subtítulos SRT sincronizados con los timestamps `t` de cada beat."""
    if not beats:
        return ""
    lines: list[str] = []
    for idx, beat in enumerate(beats):
        start = float(beat.get("t", idx * default_duration))
        if idx + 1 < len(beats):
            next_start = float(beats[idx + 1].get("t", start + default_duration))
            end = max(start + 1.5, next_start - 0.15)
        else:
            end = start + default_duration
        caption = str(beat.get("caption") or beat.get("speechText") or beat.get("title") or "").strip()
        if not caption:
            continue
        lines.append(f"{len(lines) // 4 + 1}")
        lines.append(f"{format_srt_timestamp(start)} --> {format_srt_timestamp(end)}")
        lines.append(caption)
        lines.append("")
    return "\n".join(lines).strip() + ("\n" if lines else "")


def build_musetalk_config(
    source_image: Path, audio_wav: Path, output_dir: Path
) -> dict[str, Any]:
    """Genera configuración YAML/JSON compatible con MuseTalk 1.5 `scripts.inference`."""
    return {
        "task_0": {
            "video_path": str(source_image.resolve()),
            "audio_path": str(audio_wav.resolve()),
            "bbox_shift": 0,
            "result_name": str((output_dir / "avatar_raw.mp4").resolve()),
        }
    }


def build_pipeline_commands(
    *,
    engine: str,
    source_image: Path,
    audio_wav: Path,
    output_mp4: Path,
    work_dir: Path,
    srt_path: Path | None,
    fps: int,
    musetalk_dir: Path,
    liveportrait_dir: Path,
) -> list[list[str]]:
    """Construye los comandos de avatar + FFmpeg para MuseTalk 1.5 o LivePortrait."""
    raw_avatar_mp4 = work_dir / "avatar_raw.mp4"
    commands: list[list[str]] = []

    if engine == "musetalk":
        cfg_path = work_dir / "musetalk_task.json"
        cfg_path.write_text(
            json.dumps(
                build_musetalk_config(source_image, audio_wav, work_dir),
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        commands.append(
            [
                sys.executable,
                "-m",
                "scripts.inference",
                "--inference_config",
                str(cfg_path),
                "--result_dir",
                str(work_dir),
                "--fps",
                str(fps),
                "--version",
                "v15",
            ]
        )
        _ = musetalk_dir  # cwd al ejecutar MuseTalk
    else:
        commands.append(
            [
                sys.executable,
                str(liveportrait_dir / "inference.py"),
                "-s",
                str(source_image.resolve()),
                "-d",
                str(audio_wav.resolve()),
                "-o",
                str(work_dir),
                "--flag_crop_driving_video",
            ]
        )

    ffmpeg_cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(raw_avatar_mp4),
        "-i",
        str(audio_wav.resolve()),
    ]
    if srt_path and srt_path.exists() and srt_path.read_text(encoding="utf-8").strip():
        escaped_srt = str(srt_path).replace("\\", "\\\\").replace(":", "\\:")
        ffmpeg_cmd.extend(
            [
                "-vf",
                f"subtitles='{escaped_srt}':force_style='FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00090D16,BorderStyle=3'",
            ]
        )
    ffmpeg_cmd.extend(
        [
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            str(output_mp4.resolve()),
        ]
    )
    commands.append(ffmpeg_cmd)
    return commands


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Renderiza una lección MP4 con avatar open-source (MuseTalk 1.5 / LivePortrait) + audio Kokoro-82M (.wav)."
    )
    parser.add_argument(
        "--course-json",
        required=True,
        type=Path,
        help="Ruta al archivo JSON del curso exportado desde UCG Aula Interactiva IA.",
    )
    parser.add_argument(
        "--audio-wav",
        required=True,
        type=Path,
        help="Ruta al archivo .wav descargado desde Kokoro-82M en /aula/.",
    )
    parser.add_argument(
        "--source-image",
        required=True,
        type=Path,
        help="Imagen retrato o clip base del docente (PNG/JPG/MP4).",
    )
    parser.add_argument(
        "--output",
        default=Path("leccion-avatar-ucg.mp4"),
        type=Path,
        help="Ruta del archivo MP4 final (por defecto: leccion-avatar-ucg.mp4).",
    )
    parser.add_argument(
        "--lesson-index",
        default=0,
        type=int,
        help="Índice base 0 de la lección dentro de `lessons` (por defecto: 0).",
    )
    parser.add_argument(
        "--engine",
        choices=("musetalk", "liveportrait"),
        default="musetalk",
        help="Motor de lip-sync open-source a usar (por defecto: musetalk).",
    )
    parser.add_argument(
        "--fps",
        default=25,
        type=int,
        help="Cuadros por segundo para la síntesis facial (por defecto: 25).",
    )
    parser.add_argument(
        "--subtitles",
        action="store_true",
        help="Incrustar subtítulos .srt generados desde los beats de la lección.",
    )
    parser.add_argument(
        "--musetalk-dir",
        default=Path("vendor/MuseTalk"),
        type=Path,
        help="Directorio raíz de MuseTalk 1.5.",
    )
    parser.add_argument(
        "--liveportrait-dir",
        default=Path("vendor/LivePortrait"),
        type=Path,
        help="Directorio raíz de LivePortrait.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Muestra el guion SRT y los comandos exactos sin ejecutar inferencia GPU.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if not args.course_json.exists():
        print(f"Error: no existe --course-json: {args.course_json}", file=sys.stderr)
        return 2

    payload = json.loads(args.course_json.read_text(encoding="utf-8"))
    lesson = extract_lesson(payload, args.lesson_index)
    beats = lesson.get("beats") or []
    srt_text = build_srt_from_beats(beats)

    with tempfile.TemporaryDirectory(prefix="ucg-aula-render-") as tmp:
        work_dir = Path(tmp)
        srt_path: Path | None = None
        if args.subtitles and srt_text:
            srt_path = work_dir / "captions.srt"
            srt_path.write_text(srt_text, encoding="utf-8")

        commands = build_pipeline_commands(
            engine=args.engine,
            source_image=args.source_image,
            audio_wav=args.audio_wav,
            output_mp4=args.output,
            work_dir=work_dir,
            srt_path=srt_path,
            fps=args.fps,
            musetalk_dir=args.musetalk_dir,
            liveportrait_dir=args.liveportrait_dir,
        )

        print(f"Lección: {lesson.get('title', 'Sin título')} ({len(beats)} beats)")
        print(f"Motor: {args.engine} · Audio: {args.audio_wav} · Salida: {args.output}")

        if args.dry_run:
            if srt_text:
                print("\n--- Subtítulos SRT generados ---")
                print(srt_text.strip())
            print("\n--- Comandos de renderizado ---")
            for step_idx, cmd in enumerate(commands, start=1):
                print(f"[{step_idx}] {shlex.join(cmd)}")
            return 0

        for required in (args.audio_wav, args.source_image):
            if not required.exists():
                print(f"Error: archivo de entrada no encontrado: {required}", file=sys.stderr)
                return 2

        if shutil.which("ffmpeg") is None:
            print(
                "Error: FFmpeg no está instalado en PATH. Usa --dry-run para inspeccionar la receta.",
                file=sys.stderr,
            )
            return 2

        engine_dir = args.musetalk_dir if args.engine == "musetalk" else args.liveportrait_dir
        if not engine_dir.exists():
            print(
                f"Error: no se encontró {engine_dir}. Clona el repositorio oficial o usa --dry-run.",
                file=sys.stderr,
            )
            return 2

        args.output.parent.mkdir(parents=True, exist_ok=True)
        for idx, cmd in enumerate(commands):
            cwd = str(engine_dir) if idx == 0 else None
            subprocess.run(cmd, cwd=cwd, check=True)

    print(f"Renderizado completado: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
