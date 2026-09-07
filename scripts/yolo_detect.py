import sys
import json
import os

import cv2
import numpy as np
from ultralytics import YOLO

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing image path"}))
        sys.exit(1)

    image_path = sys.argv[1]
    model_path = sys.argv[2] if len(sys.argv) > 2 else "yolov8n.pt"

    if not os.path.exists(image_path):
        print(json.dumps({"error": "image not found"}))
        sys.exit(1)

    try:
        image = cv2.imread(image_path)
        if image is None:
            print(json.dumps({"error": "cv2 failed to read image"}))
            sys.exit(1)

        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        h, w = image.shape[:2]

        model = YOLO(model_path)
        results = model(image_rgb, verbose=False, conf=0.25)

        detections = []
        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                class_name = result.names[class_id]
                confidence = float(box.conf[0])

                xyxy = np.array(box.xyxy[0].tolist(), dtype=np.float32)
                x1, y1, x2, y2 = xyxy.tolist()

                material = None
                name = class_name
                cls = class_name.lower()

                if cls in ["bottle", "wine bottle", "water bottle", "pop bottle", "soda bottle"]:
                    material = "plastic"
                elif cls in ["can", "cup", "beer can", "soda can"]:
                    material = "aluminum"
                elif cls in ["wine glass", "beer bottle", "glass"]:
                    material = "glass"
                else:
                    continue

                detections.append({
                    "detectedMaterial": material,
                    "itemName": name,
                    "confidence": round(confidence, 2),
                    "estimatedWeightGrams": 0,
                    "boundingBox": {
                        "x": round(x1, 1),
                        "y": round(y1, 1),
                        "width": round(x2 - x1, 1),
                        "height": round(y2 - y1, 1),
                    },
                })

        print(json.dumps({"items": detections}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
