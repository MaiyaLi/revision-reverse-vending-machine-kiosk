#!/usr/bin/env python3
"""
Capture training images from the Pi camera for custom YOLO model training.
Organizes images by class: plastic, aluminum, glass, background
"""
import os
import sys
import json
import time
import argparse

try:
    from picamera2 import Picamera2
    import cv2
    import numpy as np
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Install with: pip install picamera2 opencv-python-headless numpy")
    sys.exit(1)

DATASET_DIR = os.path.join(os.path.dirname(__file__), "..", "dataset")
CLASSES = ["plastic", "aluminum", "glass", "background"]
IMAGE_SIZE = (640, 640)

def ensure_dirs():
    for cls in CLASSES:
        os.makedirs(os.path.join(DATASET_DIR, cls), exist_ok=True)

def capture_images(class_name: str, count: int = 50, delay: float = 0.5):
    if class_name not in CLASSES:
        print(f"Invalid class: {class_name}. Choose from {CLASSES}")
        return

    out_dir = os.path.join(DATASET_DIR, class_name)
    existing = len([f for f in os.listdir(out_dir) if f.endswith(".jpg")])
    print(f"Capturing {count} images for class '{class_name}' (existing: {existing})")

    camera = Picamera2()
    config = camera.create_preview_configuration(main={"size": (1280, 720)})
    camera.configure(config)
    camera.start()
    time.sleep(2)  # allow camera to warm up

    try:
        for i in range(count):
            frame = camera.capture_array()
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            frame = cv2.resize(frame, IMAGE_SIZE)
            filename = os.path.join(out_dir, f"{class_name}_{existing + i + 1:04d}.jpg")
            cv2.imwrite(filename, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            print(f"Saved: {filename}")
            time.sleep(delay)
    finally:
        camera.stop()
        camera.close()

def summarize_dataset():
    summary = {}
    for cls in CLASSES:
        cls_dir = os.path.join(DATASET_DIR, cls)
        count = len([f for f in os.listdir(cls_dir) if f.endswith(".jpg")]) if os.path.isdir(cls_dir) else 0
        summary[cls] = count
    print(json.dumps({"dataset": summary}, indent=2))

def main():
    parser = argparse.ArgumentParser(description="Capture training images for custom YOLO detector")
    parser.add_argument("class_name", choices=CLASSES + ["summary"], help="Class to capture or 'summary'")
    parser.add_argument("--count", type=int, default=50, help="Number of images to capture")
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between captures in seconds")
    args = parser.parse_args()

    ensure_dirs()

    if args.class_name == "summary":
        summarize_dataset()
    else:
        capture_images(args.class_name, count=args.count, delay=args.delay)
        summarize_dataset()

if __name__ == "__main__":
    main()
