import argparse
import json
import os
import sys
import traceback
from pathlib import Path

import numpy as np


SAMPLE_RATE = 16000
CHUNK_SECONDS = 600
INITIAL_PROMPT = (
    "以下是基金从业资格考试的课程讲解，内容涉及证券投资基金、基金法、"
    "基金管理人、基金托管人、投资组合、风险收益和职业道德。"
)


def normalize_text(text):
    text = text.strip()
    if any("\u4e00" <= char <= "\u9fff" for char in text):
        text = (
            text.replace(",", "，")
            .replace("?", "？")
            .replace("!", "！")
            .replace(":", "：")
            .replace(";", "；")
        )
    return text


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def audio_duration(path):
    import av

    with av.open(path) as container:
        if container.duration:
            return float(container.duration / 1_000_000)
        stream = next((item for item in container.streams if item.type == "audio"), None)
        if stream and stream.duration and stream.time_base:
            return float(stream.duration * stream.time_base)
    return 0.0


def iter_audio_chunks(path, chunk_samples):
    import av

    container = av.open(path)
    try:
        stream = next((item for item in container.streams if item.type == "audio"), None)
        if stream is None:
            raise RuntimeError("视频中没有可识别的音轨")

        resampler = av.audio.resampler.AudioResampler(
            format="s16", layout="mono", rate=SAMPLE_RATE
        )
        buffer = []
        buffered = 0
        offset_samples = 0

        def append_frame(frame):
            nonlocal buffer, buffered
            data = frame.to_ndarray()
            if data.ndim > 1:
                data = data.reshape(-1)
            if data.dtype != np.int16:
                data = np.clip(data, -1, 1)
                data = (data * 32767).astype(np.int16)
            buffer.append(np.ascontiguousarray(data))
            buffered += len(data)

        for frame in container.decode(stream):
            for resampled in resampler.resample(frame):
                append_frame(resampled)
            while buffered >= chunk_samples:
                joined = np.concatenate(buffer) if len(buffer) > 1 else buffer[0]
                chunk = joined[:chunk_samples]
                remainder = joined[chunk_samples:]
                yield chunk, offset_samples / SAMPLE_RATE
                offset_samples += len(chunk)
                buffer = [np.ascontiguousarray(remainder)] if len(remainder) else []
                buffered = len(remainder)

        for resampled in resampler.resample(None):
            append_frame(resampled)
        if buffered:
            joined = np.concatenate(buffer) if len(buffer) > 1 else buffer[0]
            yield joined, offset_samples / SAMPLE_RATE
    finally:
        container.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--download-root", default=str(Path(__file__).parent / "models"))
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        raise FileNotFoundError(f"找不到视频文件：{input_path}")

    os.makedirs(args.download_root, exist_ok=True)
    duration = audio_duration(input_path)

    emit(
        {
            "type": "status",
            "stage": "model",
            "progress": 2,
            "message": f"正在加载 {args.model} 模型，首次使用会先下载模型",
        }
    )

    from faster_whisper import WhisperModel

    model = WhisperModel(
        args.model,
        device="cpu",
        compute_type="int8",
        download_root=args.download_root,
        cpu_threads=max(1, min(8, (os.cpu_count() or 4) - 1)),
        num_workers=1,
    )

    emit(
        {
            "type": "status",
            "stage": "transcribe",
            "progress": 4,
            "message": "模型已就绪，开始识别语音",
        }
    )

    all_segments = []
    last_progress = 4.0
    chunk_samples = SAMPLE_RATE * CHUNK_SECONDS
    offset_guess = 0.0

    for chunk, offset in iter_audio_chunks(input_path, chunk_samples):
        offset_guess = offset + len(chunk) / SAMPLE_RATE
        if len(chunk) < SAMPLE_RATE * 0.3:
            continue

        audio = chunk.astype(np.float32) / 32768.0
        segments, _info = model.transcribe(
            audio,
            language="zh",
            task="transcribe",
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            condition_on_previous_text=False,
            initial_prompt=INITIAL_PROMPT,
            word_timestamps=False,
        )

        found_in_chunk = 0
        for segment in segments:
            text = normalize_text(segment.text)
            if not text:
                continue
            item = {
                "start": round(offset + segment.start, 3),
                "end": round(offset + segment.end, 3),
                "text": text,
            }
            if item["end"] <= item["start"]:
                continue
            found_in_chunk += 1
            all_segments.append(item)
            emit({"type": "segment", **item})

            total = duration if duration > 0 else max(offset_guess, item["end"])
            progress = 4 + min(1.0, item["end"] / total) * 94 if total > 0 else last_progress
            progress = max(last_progress, min(98.5, progress))
            last_progress = progress
            emit(
                {
                    "type": "progress",
                    "progress": round(progress, 1),
                    "message": f"正在识别：{item['text'][-28:]}",
                    "current": item,
                }
            )

        if found_in_chunk == 0:
            emit(
                {
                    "type": "status",
                    "stage": "transcribe",
                    "progress": round(last_progress, 1),
                    "message": f"已跳过一段无语音内容（{int(offset // 60)} 分钟处）",
                }
            )

    if not all_segments:
        raise RuntimeError("没有识别到有效语音，请确认视频包含清晰的人声")

    # Whisper sometimes emits overlapping duplicates around chunk boundaries.
    cleaned = []
    for item in all_segments:
        previous = cleaned[-1] if cleaned else None
        if previous and item["text"] == previous["text"] and item["start"] < previous["end"] + 0.8:
            previous["end"] = max(previous["end"], item["end"])
            continue
        cleaned.append(item)

    emit({"type": "done", "progress": 100, "duration": duration, "count": len(cleaned), "segments": cleaned})


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - report the real error to the local UI
        emit(
            {
                "type": "error",
                "message": str(error),
                "detail": traceback.format_exc(),
            }
        )
        sys.exit(1)
