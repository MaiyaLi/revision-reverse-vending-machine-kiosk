import sys
import json
import os

try:
    import cv2
    import numpy as np
    try:
        from tflite_runtime.interpreter import Interpreter
    except Exception:
        from tensorflow.lite import Interpreter
except Exception as e:
    print(json.dumps({"error": f"dependency import failed: {e}"}))
    sys.exit(1)

MODEL_URL = "https://storage.googleapis.com/download.tensorflow.org/models/tflite/coco_ssd_mobilenet_v1_1.0_quant_2018_06_29.zip"
MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "detect.tflite")
LABEL_PATH = os.path.join(MODEL_DIR, "labelmap.txt")

COCO_LABELS = [
    "__background__","person","bicycle","car","motorcycle","airplane","bus","train","truck","boat",
    "traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat","dog","horse",
    "sheep","cow","elephant","bear","zebra","giraffe","backpack","umbrella","handbag","tie",
    "suitcase","frisbee","skis","snowboard","sports ball","kite","baseball bat","baseball glove",
    "skateboard","surfboard","tennis racket","bottle","wine glass","cup","fork","knife","spoon",
    "bowl","banana","apple","sandwich","orange","broccoli","carrot","hot dog","pizza","donut",
    "cake","chair","couch","potted plant","bed","dining table","toilet","tv","laptop","mouse",
    "remote","keyboard","cell phone","microwave","oven","toaster","sink","refrigerator","book",
    "clock","vase","scissors","teddy bear","hair drier","toothbrush"
]

MATERIAL_MAP = {
    "bottle": "plastic",
    "wine glass": "glass",
    "cup": "aluminum",
}

def load_labels():
    labels = list(COCO_LABELS)
    if os.path.exists(LABEL_PATH):
        try:
            with open(LABEL_PATH, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("item"):
                        continue
                    if '"name"' in line:
                        name = line.split('"')[-2]
                        labels.append(name)
        except Exception:
            pass
    return labels

def ensure_model():
    if not os.path.exists(MODEL_PATH):
        os.makedirs(MODEL_DIR, exist_ok=True)
        try:
            import urllib.request
            import zipfile
            zip_path = os.path.join(MODEL_DIR, "coco_ssd_mobilenet.zip")
            print(json.dumps({"status": "downloading_model", "url": MODEL_URL}))
            urllib.request.urlretrieve(MODEL_URL, zip_path)
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(MODEL_DIR)
            os.remove(zip_path)
        except Exception as e:
            print(json.dumps({"error": f"model download failed: {e}"}))
            sys.exit(1)

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing image path"}))
        sys.exit(1)

    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        print(json.dumps({"error": "image not found"}))
        sys.exit(1)

    try:
        ensure_model()
        labels = load_labels()
        interpreter = Interpreter(model_path=MODEL_PATH)
        interpreter.allocate_tensors()

        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()

        image = cv2.imread(image_path)
        if image is None:
            print(json.dumps({"error": "failed to read image"}))
            sys.exit(1)

        input_h, input_w = input_details[0]["shape"][1:3]
        resized = cv2.resize(image, (input_w, input_h))
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        input_data = np.expand_dims(rgb.astype(np.uint8), axis=0)

        interpreter.set_tensor(input_details[0]["index"], input_data)
        interpreter.invoke()

        boxes = interpreter.get_tensor(output_details[0]["index"])[0]
        classes = interpreter.get_tensor(output_details[1]["index"])[0]
        scores = interpreter.get_tensor(output_details[2]["index"])[0]

        detections = []
        h, w = image.shape[:2]
        for i in range(len(scores)):
            score = float(scores[i])
            if score < 0.35:
                continue

            class_id = int(classes[i])
            class_name = labels[class_id] if class_id < len(labels) else str(class_id)
            material = MATERIAL_MAP.get(class_name.lower())
            if not material:
                continue

            ymin, xmin, ymax, xmax = boxes[i]
            x1 = max(0, int(xmin * w))
            y1 = max(0, int(ymin * h))
            x2 = min(w, int(xmax * w))
            y2 = min(h, int(ymax * h))

            detections.append({
                "detectedMaterial": material,
                "itemName": class_name,
                "confidence": round(score, 2),
                "estimatedWeightGrams": 0,
                "boundingBox": {
                    "x": round(x1 / w * 100, 1),
                    "y": round(y1 / h * 100, 1),
                    "width": round(max(1, x2 - x1) / w * 100, 1),
                    "height": round(max(1, y2 - y1) / h * 100, 1),
                },
            })

        print(json.dumps({"items": detections}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
