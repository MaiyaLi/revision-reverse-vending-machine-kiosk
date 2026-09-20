from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from typing import Any, Optional

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None
    np = None

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_MODEL_PATH = os.path.join(PROJECT_ROOT, "models", "yolov8n.pt")
MIN_MODEL_CONFIDENCE = float(os.getenv("YOLO_MODEL_CONFIDENCE", "0.20"))
SENSOR_MIN_ACCEPT_CONFIDENCE = float(os.getenv("YOLO_MIN_CONFIDENCE", "0.45"))
VISION_ONLY_MIN_ACCEPT_CONFIDENCE = float(os.getenv("YOLO_VISION_ONLY_MIN_CONFIDENCE", "0.64"))
MIN_CANDIDATE_AREA_RATIO = float(os.getenv("YOLO_MIN_AREA_RATIO", "0.0025"))
CAN_ASPECT_RATIO_MIN = float(os.getenv("YOLO_CAN_ASPECT_RATIO_MIN", "0.34"))
CAN_ASPECT_RATIO_MAX = float(os.getenv("YOLO_CAN_ASPECT_RATIO_MAX", "4.8"))
BOTTLE_ASPECT_RATIO_MIN = float(os.getenv("YOLO_BOTTLE_ASPECT_RATIO_MIN", "0.16"))
BOTTLE_ASPECT_RATIO_MAX = float(os.getenv("YOLO_BOTTLE_ASPECT_RATIO_MAX", "5.5"))
MIN_CROP_PIXELS = int(os.getenv("YOLO_MIN_CROP_PIXELS", "24"))


@dataclass
class CropFeatures:
    saturation_mean: float
    value_mean: float
    value_std: float
    colorfulness: float
    edge_ratio: float
    specular_ratio: float
    dark_ratio: float
    extent: float
    solidity: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("image_path")
    parser.add_argument("model_path", nargs="?", default=os.getenv("YOLO_MODEL_PATH", DEFAULT_MODEL_PATH))
    parser.add_argument("--inductive", action="store_true")
    parser.add_argument("--weight", type=float, default=0)
    parser.add_argument("--vision-only", action="store_true")
    return parser.parse_args()


def normalized_class_name(name: str) -> str:
    return " ".join(str(name).lower().replace("_", " ").replace("-", " ").split())


def canonical_item_name(material: str) -> str:
    return {
        "aluminum": "Aluminum Can",
        "plastic": "Plastic Bottle",
        "glass": "Glass Bottle",
    }.get(material, "Rejected Item")


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def orientation_invariant_aspect_ratio(aspect_ratio: float) -> float:
    return max(aspect_ratio, 1.0 / max(aspect_ratio, 0.001))


def is_can_shape(aspect_ratio: float, extent: float = 0.0) -> bool:
    ratio = orientation_invariant_aspect_ratio(aspect_ratio)
    return CAN_ASPECT_RATIO_MIN <= ratio <= CAN_ASPECT_RATIO_MAX and extent >= 0.38


def is_bottle_shape(aspect_ratio: float) -> bool:
    ratio = orientation_invariant_aspect_ratio(aspect_ratio)
    return BOTTLE_ASPECT_RATIO_MIN <= ratio <= BOTTLE_ASPECT_RATIO_MAX


def extract_crop_features(crop: Optional[np.ndarray]) -> CropFeatures:
    if crop is None or crop.size == 0:
        return CropFeatures(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    rgb = crop.astype(np.float32)
    hsv = cv2.cvtColor(crop, cv2.COLOR_RGB2HSV)
    saturation = hsv[:, :, 1].astype(np.float32) / 255.0
    value = hsv[:, :, 2].astype(np.float32) / 255.0
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 50, 140)
    _, threshold = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    largest_area = 0.0
    largest_contour: Optional[np.ndarray] = None
    for contour in contours:
        area = float(cv2.contourArea(contour))
        if area > largest_area:
            largest_area = area
            largest_contour = contour

    height, width = gray.shape[:2]
    bbox_area = float(height * width)
    extent = largest_area / max(bbox_area, 1.0) if largest_contour is not None else 0.0
    solidity = 0.0
    if largest_contour is not None and largest_area > 0:
        hull = cv2.convexHull(largest_contour)
        hull_area = float(cv2.contourArea(hull))
        solidity = largest_area / max(hull_area, 1.0)

    red = rgb[:, :, 0]
    green = rgb[:, :, 1]
    blue = rgb[:, :, 2]
    red_green = red - green
    yellow_blue = 0.5 * (red + green) - blue
    colorfulness = float(np.sqrt(np.std(red_green) ** 2 + np.std(yellow_blue) ** 2)) / 255.0
    specular_ratio = float(np.mean((value > 0.82) & (saturation < 0.38)))
    dark_ratio = float(np.mean(value < 0.18))
    edge_ratio = float(np.count_nonzero(edges)) / max(edges.size, 1.0)

    return CropFeatures(
        saturation_mean=float(np.mean(saturation)),
        value_mean=float(np.mean(value)),
        value_std=float(np.std(value)),
        colorfulness=colorfulness,
        edge_ratio=edge_ratio,
        specular_ratio=specular_ratio,
        dark_ratio=dark_ratio,
        extent=extent,
        solidity=solidity,
    )


def appearance_scores(crop: Optional[np.ndarray], aspect_ratio: float) -> dict[str, float]:
    features = extract_crop_features(crop)
    ratio = orientation_invariant_aspect_ratio(aspect_ratio)
    can_shape = is_can_shape(aspect_ratio, features.extent)
    bottle_shape = is_bottle_shape(aspect_ratio)
    specular_strength = clamp(features.specular_ratio / 0.12)
    edge_strength = clamp(features.edge_ratio / 0.14)
    low_saturation = 1.0 - features.saturation_mean
    brightness = features.value_mean
    brightness_variation = clamp(features.value_std / 0.28)

    metallic = clamp(
        0.32 * low_saturation
        + 0.34 * specular_strength
        + 0.16 * brightness
        + 0.18 * edge_strength
    )
    glass = clamp(
        0.34 * specular_strength
        + 0.24 * edge_strength
        + 0.20 * low_saturation
        + 0.22 * brightness_variation
    )
    plastic = clamp(
        0.38 * features.colorfulness
        + 0.24 * features.saturation_mean
        + 0.20 * (1.0 - specular_strength)
        + 0.18 * edge_strength
    )

    if not can_shape:
        metallic *= 0.72
    if not bottle_shape:
        glass *= 0.78
        plastic *= 0.82

    return {
        "aluminum": metallic,
        "glass": glass,
        "plastic": plastic,
    }


def is_metallic_crop(crop: Optional[np.ndarray]) -> bool:
    features = extract_crop_features(crop)
    specular_strength = clamp(features.specular_ratio / 0.12)
    edge_strength = clamp(features.edge_ratio / 0.14)
    return features.value_mean > 0.36 and (
        features.saturation_mean < 0.46
        or specular_strength > 0.34
        or edge_strength > 0.28
    )


def material_from_class(
    class_name: str,
    aspect_ratio: float,
    inductive: bool,
    weight_grams: float,
    crop: Optional[np.ndarray],
    vision_only: bool = False,
) -> Optional[str]:
    cls = normalized_class_name(class_name)
    features = extract_crop_features(crop)
    scores = appearance_scores(crop, aspect_ratio)
    can_shape = is_can_shape(aspect_ratio, features.extent)
    bottle_shape = is_bottle_shape(aspect_ratio)
    explicit_glass = "wine glass" in cls or cls == "glass" or "glass bottle" in cls or "wine bottle" in cls
    explicit_can = "can" in cls or "beer can" in cls or "soda can" in cls
    explicit_bottle = "bottle" in cls

    if explicit_glass:
        return "glass"
    if explicit_can:
        return "aluminum"
    if inductive:
        return "aluminum"

    if "cup" in cls:
        if can_shape and (scores["aluminum"] >= 0.48 or is_metallic_crop(crop)):
            return "aluminum"
        if vision_only and scores["plastic"] >= 0.56 and scores["plastic"] >= scores["glass"] + 0.10:
            return "plastic"
        if not vision_only and scores["plastic"] >= 0.48:
            return "plastic"
        return None

    if explicit_bottle:
        if can_shape and (scores["aluminum"] >= 0.52 or is_metallic_crop(crop)):
            return "aluminum"
        if vision_only:
            if scores["glass"] >= 0.60 and scores["glass"] >= scores["plastic"] + 0.12:
                return "glass"
            if scores["plastic"] >= 0.54 and scores["plastic"] >= scores["glass"] + 0.08:
                return "plastic"
            return None
        if weight_grams > 100:
            return "glass"
        if scores["glass"] >= 0.64 and scores["glass"] >= scores["plastic"] + 0.12:
            return "glass"
        return "plastic"

    if vision_only and can_shape and scores["aluminum"] >= 0.64:
        return "aluminum"
    if vision_only and bottle_shape and scores["glass"] >= 0.68 and scores["glass"] >= scores["plastic"] + 0.14:
        return "glass"
    if vision_only and bottle_shape and scores["plastic"] >= 0.62 and scores["plastic"] >= scores["glass"] + 0.10:
        return "plastic"
    return None


def confidence_for(
    class_name: str,
    material: str,
    confidence: float,
    aspect_ratio: float,
    inductive: bool,
    weight_grams: float,
    crop: Optional[np.ndarray],
    vision_only: bool,
) -> float:
    cls = normalized_class_name(class_name)
    scores = appearance_scores(crop, aspect_ratio)
    visual_score = scores.get(material, 0.0)
    adjusted = confidence

    if vision_only:
        explicit_class = (
            (material == "glass" and ("wine glass" in cls or "glass" in cls or "wine bottle" in cls))
            or (material == "aluminum" and "can" in cls)
            or (material == "plastic" and "bottle" in cls)
        )
        class_weight = 0.62 if explicit_class else 0.52
        visual_weight = 0.38 if explicit_class else 0.48
        adjusted = clamp(class_weight * confidence + visual_weight * visual_score)
        if material == "aluminum" and not is_can_shape(aspect_ratio):
            adjusted *= 0.74
        if material == "glass" and "bottle" not in cls and "glass" not in cls:
            adjusted *= 0.82
        if material == "plastic" and "bottle" not in cls and "cup" not in cls:
            adjusted *= 0.82
    else:
        if material == "aluminum" and inductive:
            adjusted = max(adjusted, 0.65)
        if material == "aluminum" and is_can_shape(aspect_ratio):
            adjusted = max(adjusted, 0.55)
        if material == "glass" and weight_grams > 100:
            adjusted = max(adjusted, 0.65)
        if material == "aluminum" and not is_can_shape(aspect_ratio):
            adjusted *= 0.72

    return round(clamp(adjusted, 0.0, 0.99), 4)


def crop_for_box(image_rgb: np.ndarray, box: tuple[float, float, float, float]) -> Optional[np.ndarray]:
    height, width = image_rgb.shape[:2]
    x1, y1, x2, y2 = box
    left = max(0, min(width - 1, int(x1)))
    top = max(0, min(height - 1, int(y1)))
    right = max(left + 1, min(width, int(x2)))
    bottom = max(top + 1, min(height, int(y2)))
    return image_rgb[top:bottom, left:right]


def load_model(model_path: str) -> YOLO:
    if os.path.exists(model_path):
        return YOLO(model_path)
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    if os.getenv("YOLO_AUTO_DOWNLOAD", "true").lower() not in {"0", "false", "no"}:
        try:
            downloaded_path = os.path.join(PROJECT_ROOT, "yolov8n.pt")
            model = YOLO(downloaded_path)
            if os.path.exists(downloaded_path) and os.path.abspath(downloaded_path) != os.path.abspath(model_path):
                os.replace(downloaded_path, model_path)
            return model
        except Exception as error:
            raise RuntimeError(f"YOLO model not found at {model_path}; automatic download failed: {error}") from error
    raise RuntimeError(f"YOLO model not found at {model_path}")


def main() -> int:
    args = parse_args()
    image_path = args.image_path
    model_path = args.model_path
    inductive = bool(args.inductive)
    weight_grams = float(args.weight or 0)
    vision_only = bool(args.vision_only or (not inductive and weight_grams <= 0))
    minimum_accept_confidence = VISION_ONLY_MIN_ACCEPT_CONFIDENCE if vision_only else SENSOR_MIN_ACCEPT_CONFIDENCE

    if cv2 is None or np is None or YOLO is None:
        print(json.dumps({"error": "Python vision dependencies are not installed"}))
        return 1

    if not os.path.exists(image_path):
        print(json.dumps({"error": "image not found"}))
        return 1

    try:
        image = cv2.imread(image_path)
        if image is None:
            print(json.dumps({"error": "cv2 failed to read image"}))
            return 1

        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        height, width = image.shape[:2]
        image_area = float(width * height)
        model = load_model(model_path)
        image_size = int(os.getenv("YOLO_IMAGE_SIZE", "640"))
        results = model(image_rgb, verbose=False, conf=MIN_MODEL_CONFIDENCE, imgsz=image_size)

        detections: list[dict[str, Any]] = []
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                class_id = int(box.cls[0])
                class_name = str(result.names[class_id])
                confidence = float(box.conf[0])
                x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
                box_width = max(0.0, x2 - x1)
                box_height = max(0.0, y2 - y1)
                aspect_ratio = box_width / max(box_height, 1.0)
                area_ratio = (box_width * box_height) / max(image_area, 1.0)

                if area_ratio < MIN_CANDIDATE_AREA_RATIO or min(box_width, box_height) < MIN_CROP_PIXELS:
                    continue

                box_tuple = (x1, y1, x2, y2)
                crop = crop_for_box(image_rgb, box_tuple)
                material = material_from_class(class_name, aspect_ratio, inductive, weight_grams, crop, vision_only)
                if material is None:
                    continue

                adjusted_confidence = confidence_for(
                    class_name,
                    material,
                    confidence,
                    aspect_ratio,
                    inductive,
                    weight_grams,
                    crop,
                    vision_only,
                )
                status = "accepted" if adjusted_confidence >= minimum_accept_confidence else "rejected"
                scores = appearance_scores(crop, aspect_ratio)
                x1 = max(0.0, min(float(width), x1))
                y1 = max(0.0, min(float(height), y1))
                x2 = max(0.0, min(float(width), x2))
                y2 = max(0.0, min(float(height), y2))

                detections.append({
                    "detectedMaterial": material,
                    "itemName": canonical_item_name(material),
                    "confidence": adjusted_confidence,
                    "estimatedWeightGrams": round(weight_grams) if weight_grams > 0 else 0,
                    "status": status,
                    "boundingBox": {
                        "x": round(x1, 1),
                        "y": round(y1, 1),
                        "width": round(max(0.0, x2 - x1), 1),
                        "height": round(max(0.0, y2 - y1), 1),
                    },
                    "imageWidth": int(width),
                    "imageHeight": int(height),
                    "orientationInvariantAspectRatio": round(orientation_invariant_aspect_ratio(aspect_ratio), 4),
                    "visionOnly": vision_only,
                    "visualScores": {name: round(score, 4) for name, score in scores.items()},
                })

        print(json.dumps({
            "items": detections,
            "imageWidth": int(width),
            "imageHeight": int(height),
            "visionOnly": vision_only,
        }))
        return 0
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
