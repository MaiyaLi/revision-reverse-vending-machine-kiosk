import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";

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
      execSync(`rpicam-still -o ${tmpFile} --width 1920 --height 1080 --nopreview --timeout 200 --quality 90`, {
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
          reasoning: "Image capture failed",
          boundingBox: undefined
        };
      }

      let materialType = "other";
      let itemName = "Unknown item";
      let confidence = 0.3;
      let estimatedWeight = 0;
      let reasoning = "No AI available - please set GEMINI_API_KEY in .env";
      let boundingBox: BoundingBox | undefined;

      if (this.ai) {
        try {
          const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
          const response = await this.ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: [
              { inlineData: { data: base64Data, mimeType: "image/jpeg" } },
               {
                 text: `You are a recycling classifier for a reverse vending machine. Analyze this image and detect ALL recyclable items present.

Classify EACH item as ONE of:
1. "plastic" - clear/translucent bottles, soda bottles, containers with plastic appearance
2. "aluminum" - metallic cans, silver beverage cans, aluminum foil containers  
3. "glass" - transparent glass bottles, beer bottles, glass jars
4. "other" - anything else, non-recyclable items, or unclear

For EACH detected item, estimate its bounding box location as percentages (0-100) relative to image dimensions:
- x: left position percentage
- y: top position percentage  
- width: width percentage
- height: height percentage

Return a JSON array of ALL detected items:
{"items": [{"detectedMaterial": "...", "itemName": "...", "confidence": 0.0-1.0, "estimatedWeightGrams": number, "reasoning": "...", "boundingBox": {"x": number, "y": number, "width": number, "height": number}}]}

If no items are detected, return: {"items": []}`
               }
            ],
            config: {
              responseMimeType: "application/json"
            }
          });

          const responseText = response.text || "";
          const parsed = JSON.parse(responseText.trim());
          
          if (parsed.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
            const best = parsed.items[0];
            materialType = best.detectedMaterial || materialType;
            itemName = best.itemName || itemName;
            confidence = best.confidence || confidence;
            estimatedWeight = best.estimatedWeightGrams || estimatedWeight;
            reasoning = best.reasoning || reasoning;
            if (best.boundingBox && typeof best.boundingBox.x === 'number') {
              boundingBox = best.boundingBox;
            }
          } else {
            reasoning = "No recyclable items detected in image";
            confidence = 0.2;
          }
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
        reasoning,
        boundingBox
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
        reasoning: error.message || "Unknown error",
        boundingBox: undefined
      };
    }
  }

  async detectMultipleItems(imageBase64?: string): Promise<MultiDetectionResult> {
    try {
      const image = imageBase64 || await this.captureImage();
      
      if (!image) {
        return {
          items: [],
          timestamp: new Date().toISOString(),
          imageBase64: null
        };
      }

      const items: DetectionResult[] = [];

      if (this.ai) {
        try {
          const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
          const response = await this.ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: [
              { inlineData: { data: base64Data, mimeType: "image/jpeg" } },
               {
                 text: `You are a recycling classifier for a reverse vending machine. This is a fixed camera view. Look carefully for ANY recyclable containers or objects.

Classify EACH visible item as ONE of:
1. "plastic" - bottles, containers, cups, wrappers, anything plastic-looking
2. "aluminum" - cans, foil, metallic containers
3. "glass" - bottles, jars, anything glass/transparent
4. "other" - non-recyclable or unclear

IMPORTANT RULES:
- If you see ANY container or bottle-like object, classify it
- Be generous with classification - if it looks like a container, classify it
- Even partially visible items should be detected
- Empty/clear bottles count as plastic
- The camera may have glare or poor lighting - do your best

For EACH detected item, provide bounding box percentages (0-100):
- x: left edge %
- y: top edge %
- width: width %
- height: height %

Return JSON: {"items": [{"detectedMaterial": "...", "itemName": "...", "confidence": 0.0-1.0, "estimatedWeightGrams": number, "reasoning": "...", "boundingBox": {"x": number, "y": number, "width": number, "height": number}}]}

If absolutely nothing is visible: {"items": []}`
               }
            ],
            config: {
              responseMimeType: "application/json"
            }
          });

          const responseText = response.text || "";
          const parsed = JSON.parse(responseText.trim());
          
          if (parsed.items && Array.isArray(parsed.items)) {
            for (const item of parsed.items) {
              const result: DetectionResult = {
                detectedMaterial: item.detectedMaterial || "other",
                itemName: item.itemName || "Unknown item",
                confidence: item.confidence || 0.5,
                estimatedWeightGrams: item.estimatedWeightGrams || 0,
                timestamp: new Date().toISOString(),
                imageBase64: image,
                reasoning: item.reasoning || "",
                boundingBox: item.boundingBox && typeof item.boundingBox.x === 'number' ? item.boundingBox : undefined
              };
              items.push(result);
            }
          }
        } catch (err: any) {
          console.warn("Gemini multi-detection failed:", err.message);
        }
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
        imageBase64: image
      };
    } catch (error: any) {
      return {
        items: [],
        timestamp: new Date().toISOString(),
        imageBase64: null
      };
    }
  }

  async startBackgroundDetection(intervalMs: number = 4000) {
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