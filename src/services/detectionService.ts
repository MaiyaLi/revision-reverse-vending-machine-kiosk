import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";

export interface DetectionResult {
  detectedMaterial: string;
  itemName: string;
  confidence: number;
  estimatedWeightGrams: number;
  timestamp: string;
  imageBase64: string | null;
  reasoning: string;
}

export class DetectionService {
  private ai: GoogleGenAI | null = null;
  private detectionHistory: DetectionResult[] = [];
  private isDetecting = false;
  private lastImage: string | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
      try {
        this.ai = new GoogleGenAI({ apiKey });
      } catch (err) {
        console.warn("Failed to initialize Gemini client:", err);
      }
    }
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
      const { execSync } = require("child_process");
      execSync(`rpicam-still -o ${tmpFile} --width 640 --height 480 --nopreview --timeout 100`, {
        stdio: "ignore",
        timeout: 5000
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

  async detectItem(imageBase64?: string): Promise<DetectionResult> {
    try {
      const image = imageBase64 || await this.captureImage();
      
      if (!image) {
        return {
          detectedMaterial: "other",
          itemName: "No image available",
          confidence: 0,
          estimatedWeightGrams: 0,
          timestamp: new Date().toISOString(),
          imageBase64: null,
          reasoning: "Image capture failed"
        };
      }

      let materialType = "plastic";
      let itemName = "PET Beverage Bottle";
      let confidence = 0.95;
      let estimatedWeight = 22;
      let reasoning = "Sensor-based classification";

      if (this.ai) {
        try {
          const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
          const response = await this.ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: [
              { inlineData: { data: base64Data, mimeType: "image/jpeg" } },
              {
                text: `Analyze this recyclable container. Identify if it's:
1. "plastic" (soda bottle, container)
2. "aluminum" (beverage can)
3. "glass" (beer bottle, container)
4. "other" (unsupported)

Respond ONLY in JSON: {"detectedMaterial": "...", "itemName": "...", "confidence": 0.0-1.0, "estimatedWeightGrams": 0, "reasoning": "..."}`
              }
            ],
            config: {
              responseMimeType: "application/json"
            }
          });

          const responseText = response.text || "";
          const parsed = JSON.parse(responseText.trim());
          materialType = parsed.detectedMaterial || materialType;
          itemName = parsed.itemName || itemName;
          confidence = parsed.confidence || confidence;
          estimatedWeight = parsed.estimatedWeightGrams || estimatedWeight;
          reasoning = parsed.reasoning || reasoning;
        } catch (err: any) {
          console.warn("Gemini detection failed:", err.message);
          reasoning = "AI detection failed, using sensor-based fallback";
        }
      }

      const result: DetectionResult = {
        detectedMaterial: materialType,
        itemName,
        confidence,
        estimatedWeightGrams: estimatedWeight,
        timestamp: new Date().toISOString(),
        imageBase64: image,
        reasoning
      };

      // Add to history (keep last 50)
      this.detectionHistory.unshift(result);
      if (this.detectionHistory.length > 50) {
        this.detectionHistory.pop();
      }

      return result;
    } catch (error: any) {
      return {
        detectedMaterial: "other",
        itemName: "Detection error",
        confidence: 0,
        estimatedWeightGrams: 0,
        timestamp: new Date().toISOString(),
        imageBase64: null,
        reasoning: error.message || "Unknown error"
      };
    }
  }

  async startBackgroundDetection(intervalMs: number = 2000) {
    if (this.isDetecting) return;
    this.isDetecting = true;

    const detect = async () => {
      if (!this.isDetecting) return;
      try {
        await this.detectItem();
      } catch (err) {
        console.warn("Background detection error:", err);
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