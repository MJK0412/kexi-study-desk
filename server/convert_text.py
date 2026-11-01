import json
import sys

from opencc import OpenCC


def main():
    payload = json.load(sys.stdin)
    texts = payload.get("texts", [])
    if not isinstance(texts, list):
        raise ValueError("texts must be a list")
    converter = OpenCC("t2s")
    result = [converter.convert(str(text or "")) for text in texts]
    json.dump({"texts": result}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
