#!/usr/bin/env python3
"""Remux a Bilibili DASH cache pair into a browser-playable MP4.

Bilibili's desktop client stores separate video/audio .m4s fragments with a
9-byte ASCII header ("000000000") before the ISO-BMFF boxes.  PyAV cannot
demux fragmented MP4 from a file object, so we strip the header into a short
lived temp file and then stream-copy both tracks into a normal MP4.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import uuid

import av

CACHE_HEADER = b"000000000"
CHUNK = 4 * 1024 * 1024


def strip_cache_header(source: str, target: str) -> bool:
    """Copy source without Bilibili's 9-byte prefix. Returns True if copied."""
    with open(source, "rb") as src:
        head = src.read(len(CACHE_HEADER))
        if head != CACHE_HEADER:
            return False
        with open(target, "wb") as dst:
            while True:
                chunk = src.read(CHUNK)
                if not chunk:
                    break
                dst.write(chunk)
    return True


def first_stream(container, kind: str):
    for stream in container.streams:
        if stream.type == kind:
            return stream
    return None


def remux(video_path: str, audio_path: str, output_path: str) -> dict:
    token = uuid.uuid4().hex
    work_dir = os.path.dirname(os.path.abspath(output_path))
    video_input = video_path
    audio_input = audio_path
    stripped_video = os.path.join(work_dir, f".kexi-bili-{token}-video.mp4")
    stripped_audio = os.path.join(work_dir, f".kexi-bili-{token}-audio.mp4")
    temp_output = os.path.join(work_dir, f".kexi-bili-{token}-out.mp4")
    try:
        if strip_cache_header(video_path, stripped_video):
            video_input = stripped_video
        if strip_cache_header(audio_path, stripped_audio):
            audio_input = stripped_audio

        video_container = av.open(video_input)
        audio_container = av.open(audio_input)
        try:
            video_in = first_stream(video_container, "video")
            audio_in = first_stream(audio_container, "audio")
            if video_in is None:
                raise RuntimeError("缓存文件中没有视频轨")
            if audio_in is None:
                raise RuntimeError("缓存文件中没有音频轨")

            out = av.open(
                temp_output,
                mode="w",
                format="mp4",
                options={"movflags": "faststart"},
            )
            try:
                video_out = out.add_stream_from_template(video_in)
                audio_out = out.add_stream_from_template(audio_in)
                video_out.time_base = video_in.time_base
                audio_out.time_base = audio_in.time_base

                video_packets = video_container.demux(video_in)
                audio_packets = audio_container.demux(audio_in)
                next_video = next(video_packets, None)
                next_audio = next(audio_packets, None)
                video_count = 0
                audio_count = 0

                while next_video is not None or next_audio is not None:
                    take_video = next_audio is None
                    if next_video is not None and next_audio is not None:
                        take_video = (next_video.dts or 0) <= (next_audio.dts or 0)
                    packet = next_video if take_video else next_audio
                    if take_video:
                        next_video = next(video_packets, None)
                    else:
                        next_audio = next(audio_packets, None)
                    if packet.dts is None:
                        continue
                    packet.stream = video_out if take_video else audio_out
                    out.mux(packet)
                    if take_video:
                        video_count += 1
                    else:
                        audio_count += 1
            finally:
                out.close()
            if video_count == 0 or audio_count == 0:
                raise RuntimeError("缓存轨道没有可读取的数据，文件可能尚未下载完成")
            os.replace(temp_output, output_path)
            return {
                "ok": True,
                "output": output_path,
                "videoPackets": video_count,
                "audioPackets": audio_count,
                "duration": max(
                    float(video_in.duration * video_in.time_base) if video_in.duration else 0,
                    float(audio_in.duration * audio_in.time_base) if audio_in.duration else 0,
                ),
            }
        finally:
            video_container.close()
            audio_container.close()
    finally:
        for path in (stripped_video, stripped_audio, temp_output):
            try:
                os.remove(path)
            except OSError:
                pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        result = remux(args.video, args.audio, args.output)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as error:  # noqa: BLE001 - CLI boundary
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
