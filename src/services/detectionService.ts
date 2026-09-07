import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { localDetectionService } from "./localDetectionService";

dotenv.config();

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionResult {
  detectedMaterial: string;
  itemName: string;
  confidence: number;
  estimatedWeightGrams: number;
  timestamp: string;
  imageBase64: string | null;
  reasoning: string;
  boundingBox?: BoundingBox;
}

export interface MultiDetectionResult {
  items: DetectionResult[];
  timestamp: string;
  imageBase64: string | null;
  error?: string;
}

export class DetectionService {
  private detectionHistory: DetectionResult[] = [];
  private isDetecting = false;
  private lastImage: string | null = null;

  constructor() {
    console.log("🧠 Using YOLO local detection (Ultralytics)");
  }

  getLastImage(): string | null {
    return this.lastImage;
  }

  getHistory(): DetectionResult[] {
    return this.detectionHistory;
  }

  async captureImage(): Promise<string | null> {
    try {
      const tmpFile = `/tmp/rvm-detect-${Date.now()}.jpg`;
      const { execSync } = await import("child_process");
      execSync(`rpicam-still -o ${tmpFile} --width 1280 --height 720 --nopreview --timeout 400 --quality 92 --sharpness 1.5 --contrast 1.2 --brightness 1.1`, {
        stdio: "ignore",
        timeout: 8000
      });
      const imageBuffer = fs.readFileSync(tmpFile);
      const base64 = imageBuffer.toString("base64");
      fs.unlinkSync(tmpFile);
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      this.lastImage = dataUrl;
      return dataUrl;
    } catch (error) {
      console.warn("Image capture failed:", (error as Error).message);
      return null;
    }
  }

  async detectMultipleItems(imageBase64?: string): Promise<MultiDetectionResult> {
    try {
      const image = imageBase64 || await this.captureImage();

      if (!image) {
        console.log("📸 Camera capture failed - no image");
        return {
          items: [],
          timestamp: new Date().toISOString(),
          imageBase64: null
        };
      }
      console.log("📸 Image captured successfully");

      const items: DetectionResult[] = [];

      console.log("🧠 Using YOLO detection...");
      let yoloError: string | undefined;
      try {
        const yoloResult = await localDetectionService.detectFromImage(image);
        for (const item of yoloResult.items) {
          items.push({
            ...item,
            timestamp: new Date().toISOString(),
            imageBase64: image,
            reasoning: "Detected via local YOLO model"
          });
        }
        if (items.length > 0) {
          console.log(`✅ YOLO detection found ${items.length} items`);
        } else {
          console.log("⚠️ YOLO detection returned 0 items");
        }
        if (yoloResult.error) {
          yoloError = yoloResult.error;
          console.warn("⚠️ YOLO reported error:", yoloError);
        }
      } catch (yoloErr) {
        console.warn("❌ YOLO detection failed:", yoloErr);
        yoloError = (yoloErr as Error)?.message || String(yoloErr);
      }

      for (const item of items) {
        this.detectionHistory.unshift(item);
      }
      if (this.detectionHistory.length > 50) {
        this.detectionHistory = this.detectionHistory.slice(0, 50);
      }

      return {
        items,
        timestamp: new Date().toISOString(),
        imageBase64: image,
        error: yoloError,
      };
    } catch (error: any) {
      console.error("❌ Multi-detection error:", error);
      return {
        items: [],
        timestamp: new Date().toISOString(),
        imageBase64: null
      };
    }
  }

  async startBackgroundDetection(intervalMs: number = 15000) {
    if (this.isDetecting) return;
    this.isDetecting = true;
    console.log(`🔍 Background camera detection started (interval: ${intervalMs}ms)`);

    const detect = async () => {
      if (!this.isDetecting) return;

      console.log("⏳ Running detection cycle...");
      try {
        const multiResult = await this.detectMultipleItems();
        console.log(`📊 Detection result: ${multiResult.items.length} items found`);
        if (multiResult.items.length > 0) {
          console.log(`🔍 Detected ${multiResult.items.length} item(s):`, multiResult.items.map(i => `${i.detectedMaterial} (${(i.confidence * 100).toFixed(1)}%)`).join(', '));
        } else {
          console.log("⚠️ No items detected in this cycle");
        }
      } catch (err) {
        console.warn("❌ Background detection error:", err);
      }
      if (this.isDetecting) {
        setTimeout(detect, intervalMs);
      }
    };

    detect();
  }

  stopBackgroundDetection() {
    this.isDetecting = false;
  }
}

export const detectionService = new DetectionService();
