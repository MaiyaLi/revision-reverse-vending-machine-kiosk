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
      const { execSync } = await import("child_process");
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

      let materialType = "other";
      let itemName = "Unknown item";
      let confidence = 0.3;
      let estimatedWeight = 0;
      let reasoning = "No AI available - please set GEMINI_API_KEY in .env";

      if (this.ai) {
        try {
          const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
          const response = await this.ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: [
              { inlineData: { data: base64Data, mimeType: "image/jpeg" } },
               {
                 text: `You are a recycling classifier. Look at this image and identify the material type based on visual characteristics.

Classify as ONE of:
1. "plastic" - clear/translucent bottles, soda bottles, containers with plastic appearance
2. "aluminum" - metallic cans, silver beverage cans, aluminum foil containers  
3. "glass" - transparent glass bottles, beer bottles, glass jars
4. "other" - anything else, non-recyclable items, or unclear

Look for: material texture, transparency, color, shape, labels, reflections.

Respond ONLY in JSON: {"detectedMaterial": "plastic|aluminum|glass|other", "itemName": "descriptive name", "confidence": 0.0-1.0, "estimatedWeightGrams": number, "reasoning": "what you see"}`
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
          reasoning = "AI detection failed - check GEMINI_API_KEY in .env";
          confidence = 0.2;
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