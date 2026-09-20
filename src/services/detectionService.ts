import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import dotenv from "dotenv";
import { db } from "./database";
import {
  localDetectionService,
  type DetectionOptions,
  type DetectionResult as LocalDetectionResult,
  type MultiDetectionResult as LocalMultiDetectionResult,
} from "./localDetectionService";

dotenv.config();

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionResult {
  detectedMaterial: "plastic" | "aluminum" | "glass" | "other";
  itemName: string;
  confidence: number;
  estimatedWeightGrams: number;
  status: "accepted" | "rejected";
  timestamp: string;
  imageBase64: string | null;
  reasoning: string;
  boundingBox?: BoundingBox;
  imageWidth?: number;
  imageHeight?: number;
}

export interface MultiDetectionResult {
  items: DetectionResult[];
  rejectedItems?: DetectionResult[];
  timestamp: string;
  imageBase64: string | null;
  imageWidth?: number;
  imageHeight?: number;
  error?: string;
}

interface FrameDetection {
  result: LocalMultiDetectionResult;
  frameIndex: number;
  imageBase64: string;
}

interface DetectionGroup {
  material: LocalDetectionResult["detectedMaterial"];
  item: LocalDetectionResult;
  imageBase64: string | null;
  frameIndices: Set<number>;
  confidences: number[];
}

const DEFAULT_FRAME_COUNT = 3;
const SENSOR_CONSENSUS_FRAME_COUNT = 2;
const VISION_ONLY_CONSENSUS_FRAME_COUNT = 2;
const SENSOR_SINGLE_FRAME_ACCEPT_CONFIDENCE = 0.72;
const VISION_ONLY_SINGLE_FRAME_ACCEPT_CONFIDENCE = 0.78;

function detectionsMatch(first: LocalDetectionResult, second: LocalDetectionResult): boolean {
  if (!first.boundingBox || !second.boundingBox) {
    return true;
  }

  const width = Math.max(first.imageWidth || 1, second.imageWidth || 1, first.boundingBox.width, second.boundingBox.width);
  const height = Math.max(first.imageHeight || 1, second.imageHeight || 1, first.boundingBox.height, second.boundingBox.height);
  const firstCenterX = first.boundingBox.x + first.boundingBox.width / 2;
  const firstCenterY = first.boundingBox.y + first.boundingBox.height / 2;
  const secondCenterX = second.boundingBox.x + second.boundingBox.width / 2;
  const secondCenterY = second.boundingBox.y + second.boundingBox.height / 2;
  const centerDistance = Math.hypot(firstCenterX - secondCenterX, firstCenterY - secondCenterY);
  const normalizedDistance = centerDistance / Math.max(Math.hypot(width, height), 1);

  const left = Math.max(first.boundingBox.x, second.boundingBox.x);
  const top = Math.max(first.boundingBox.y, second.boundingBox.y);
  const right = Math.min(first.boundingBox.x + first.boundingBox.width, second.boundingBox.x + second.boundingBox.width);
  const bottom = Math.min(first.boundingBox.y + first.boundingBox.height, second.boundingBox.y + second.boundingBox.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const firstArea = first.boundingBox.width * first.boundingBox.height;
  const secondArea = second.boundingBox.width * second.boundingBox.height;
  const union = firstArea + secondArea - intersection;
  const overlap = intersection / Math.max(union, 1);

  return normalizedDistance <= 0.22 || overlap >= 0.15;
}

export class DetectionService {
  private detectionHistory: DetectionResult[] = [];
  private isDetecting = false;
  private lastImage: string | null = null;

  constructor() {
    console.log("🧠 Using YOLO local detection (Ultralytics)");
    this.loadHistoryFromDb().catch((err) => {
      console.warn("⚠️  Failed to load detection history from DB:", err);
    });
  }

  getLastImage(): string | null {
    return this.lastImage;
  }

  getHistory(): DetectionResult[] {
    return this.detectionHistory;
  }

  async getHistoryFromDb(limit: number = 20): Promise<DetectionResult[]> {
    if (!db.isConnected()) {
      return this.detectionHistory.slice(0, limit);
    }
    try {
      const rows = await db.query(
        `SELECT * FROM detection_history
         WHERE "timestamp" IS NOT NULL
         ORDER BY "timestamp" DESC
         LIMIT $1`,
        [limit]
      );
      return rows.map((r: any) => ({
        detectedMaterial: r.detectedMaterial,
        itemName: r.itemName || "",
        confidence: parseFloat(r.confidence || 0),
        estimatedWeightGrams: parseInt(r.estimatedWeightGrams || 0),
        status: r.status === "rejected" ? "rejected" : "accepted",
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
        imageBase64: r.imageBase64,
        reasoning: "Loaded from database",
        boundingBox: r.boundingBox ? (typeof r.boundingBox === "string" ? JSON.parse(r.boundingBox) : r.boundingBox) : undefined,
        imageWidth: r.imageWidth ? Number(r.imageWidth) : undefined,
        imageHeight: r.imageHeight ? Number(r.imageHeight) : undefined,
      }));
    } catch (error) {
      console.warn("⚠️  Failed to load detection history from DB:", (error as Error).message);
      return this.detectionHistory.slice(0, limit);
    }
  }

  async loadHistoryFromDb(): Promise<void> {
    if (!db.isConnected()) return;
    try {
      const rows = await db.query(
        `SELECT * FROM detection_history
         ORDER BY "timestamp" DESC
         LIMIT 50`
      );
      this.detectionHistory = rows.map((r: any) => ({
        detectedMaterial: r.detectedMaterial,
        itemName: r.itemName || "",
        confidence: parseFloat(r.confidence || 0),
        estimatedWeightGrams: parseInt(r.estimatedWeightGrams || 0),
        status: r.status === "rejected" ? "rejected" : "accepted",
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
        imageBase64: r.imageBase64,
        reasoning: "Loaded from database",
        boundingBox: r.boundingBox ? (typeof r.boundingBox === "string" ? JSON.parse(r.boundingBox) : r.boundingBox) : undefined,
        imageWidth: r.imageWidth ? Number(r.imageWidth) : undefined,
        imageHeight: r.imageHeight ? Number(r.imageHeight) : undefined,
      }));
      console.log(`📊 Loaded ${this.detectionHistory.length} detection(s) from database`);
    } catch (error) {
      console.warn("⚠️  Failed to load detection history from DB:", (error as Error).message);
    }
  }

  async saveDetectionResult(item: DetectionResult): Promise<void> {
    if (!db.isConnected()) return;
    try {
      await db.query(
        `INSERT INTO detection_history (
          id, "detectedMaterial", "itemName", "confidence", "estimatedWeightGrams",
          "imageBase64", "boundingBox", "imageWidth", "imageHeight",
          "timestamp", "createdAt", "status"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)`,
        [
          uuidv4(),
          item.detectedMaterial,
          item.itemName || null,
          item.confidence,
          item.estimatedWeightGrams,
          item.imageBase64,
          item.boundingBox ? JSON.stringify(item.boundingBox) : null,
          item.imageWidth || null,
          item.imageHeight || null,
          item.timestamp,
          item.status,
        ]
      );
    } catch (error) {
      console.warn("⚠️  Failed to save detection result to DB:", (error as Error).message);
    }
  }

  async captureImage(): Promise<string | null> {
    const tmpFile = path.join(os.tmpdir(), `rvm-detect-${process.pid}-${Date.now()}.jpg`);
    const commands: Array<[string, string[]]> = [
      [
        "rpicam-still",
        ["-o", tmpFile, "--width", "640", "--height", "480", "--nopreview", "--timeout", "400", "--quality", "92"],
      ],
      [
        "libcamera-still",
        ["-o", tmpFile, "--width", "640", "--height", "480", "--timeout", "400", "--quality", "92"],
      ],
      ["fswebcam", ["-r", "640x480", "--jpeg", "85", "-D", "1", tmpFile]],
      ["ffmpeg", ["-y", "-f", "v4l2", "-i", "/dev/video0", "-frames:v", "1", tmpFile]],
    ];

    try {
      for (const [command, args] of commands) {
        try {
          execFileSync(command, args, { stdio: "ignore", timeout: 8000 });
          if (fs.existsSync(tmpFile)) {
            const base64 = fs.readFileSync(tmpFile).toString("base64");
            const dataUrl = `data:image/jpeg;base64,${base64}`;
            this.lastImage = dataUrl;
            return dataUrl;
          }
        } catch {}
      }
      console.warn("Image capture failed: no supported camera command produced an image");
      return null;
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {}
    }
  }

  async detectMultipleItems(
    imageBase64?: string,
    options: DetectionOptions = {}
  ): Promise<MultiDetectionResult> {
    const configuredFrames = Number.parseInt(process.env.DETECTION_FRAMES || String(DEFAULT_FRAME_COUNT), 10);
    const frameCount = imageBase64 ? 1 : Math.max(1, Math.min(5, Number.isFinite(configuredFrames) ? configuredFrames : DEFAULT_FRAME_COUNT));
    const frames: Array<{ imageBase64: string; frameIndex: number }> = [];

    if (imageBase64?.trim()) {
      frames.push({ imageBase64: imageBase64.trim(), frameIndex: 0 });
    } else {
      for (let index = 0; index < frameCount; index += 1) {
        const image = await this.captureImage();
        if (image) {
          frames.push({ imageBase64: image, frameIndex: index });
        }
        if (index < frameCount - 1) {
          await new Promise((resolve) => setTimeout(resolve, 140));
        }
      }
    }

    if (frames.length === 0) {
      return {
        items: [],
        rejectedItems: [],
        timestamp: new Date().toISOString(),
        imageBase64: null,
        error: "Camera capture failed",
      };
    }

    const visionOnly =
      options.visionOnly ??
      (!options.inductiveReading && !(options.weightGrams && options.weightGrams > 0));
    const detectionOptions: DetectionOptions = { ...options, visionOnly };
    const frameDetections: FrameDetection[] = [];
    for (const frame of frames) {
      const result = await localDetectionService.detectFromImage(frame.imageBase64, detectionOptions);
      frameDetections.push({ result, frameIndex: frame.frameIndex, imageBase64: frame.imageBase64 });
    }

    const aggregate = this.aggregateFrameDetections(frameDetections, detectionOptions);
    const resultsToRecord = [...aggregate.items, ...(aggregate.rejectedItems || [])];

    for (const item of resultsToRecord) {
      this.detectionHistory.unshift(item);
      void this.saveDetectionResult(item);
    }
    if (this.detectionHistory.length > 50) {
      this.detectionHistory = this.detectionHistory.slice(0, 50);
    }

    return {
      items: aggregate.items,
      rejectedItems: aggregate.rejectedItems,
      timestamp: new Date().toISOString(),
      imageBase64: aggregate.imageBase64,
      imageWidth: aggregate.imageWidth,
      imageHeight: aggregate.imageHeight,
      error: aggregate.error,
    };
  }

  private aggregateFrameDetections(
    frameDetections: FrameDetection[],
    options: DetectionOptions
  ): Omit<MultiDetectionResult, "timestamp"> {
    if (frameDetections.length === 0) {
      return {
        items: [],
        rejectedItems: [],
        imageBase64: null,
        imageWidth: undefined,
        imageHeight: undefined,
        error: "No camera frames were captured",
      };
    }

    const visionOnly = options.visionOnly === true;
    const consensusFrameCount = visionOnly
      ? VISION_ONLY_CONSENSUS_FRAME_COUNT
      : SENSOR_CONSENSUS_FRAME_COUNT;
    const singleFrameAcceptConfidence = visionOnly
      ? VISION_ONLY_SINGLE_FRAME_ACCEPT_CONFIDENCE
      : SENSOR_SINGLE_FRAME_ACCEPT_CONFIDENCE;
    const candidates = frameDetections.flatMap((frame) =>
      frame.result.items.map((item) => ({ item, frameIndex: frame.frameIndex, imageBase64: frame.imageBase64 }))
    );
    const rejectedCandidates = frameDetections.flatMap((frame) =>
      (frame.result.rejectedItems || []).map((item) => ({
        item,
        frameIndex: frame.frameIndex,
        imageBase64: frame.imageBase64,
      }))
    );
    const groups: DetectionGroup[] = [];

    for (const candidate of candidates) {
      const existing = groups.find(
        (group) => group.material === candidate.item.detectedMaterial && detectionsMatch(group.item, candidate.item)
      );
      if (!existing) {
        groups.push({
          material: candidate.item.detectedMaterial,
          item: candidate.item,
          imageBase64: candidate.imageBase64,
          frameIndices: new Set([candidate.frameIndex]),
          confidences: [candidate.item.confidence],
        });
        continue;
      }
      existing.frameIndices.add(candidate.frameIndex);
      existing.confidences.push(candidate.item.confidence);
      if (candidate.item.confidence > existing.item.confidence) {
        existing.item = candidate.item;
        existing.imageBase64 = candidate.imageBase64;
      }
    }

    const accepted: DetectionResult[] = [];
    const rejected: DetectionResult[] = [];

    for (const group of groups) {
      const frameCount = group.frameIndices.size;
      const maxConfidence = Math.max(...group.confidences);
      const averageConfidence = group.confidences.reduce((sum, value) => sum + value, 0) / group.confidences.length;
      const consensus = frameCount >= consensusFrameCount || maxConfidence >= singleFrameAcceptConfidence;
      const sensorConflict =
        !visionOnly &&
        ((options.inductiveReading && group.material !== "aluminum") ||
          (Boolean(options.weightGrams && options.weightGrams > 100) && group.material !== "glass"));
      const status = consensus && !sensorConflict ? "accepted" : "rejected";
      const item: DetectionResult = {
        ...group.item,
        detectedMaterial: group.material,
        confidence: Number((consensus ? Math.min(0.99, Math.max(maxConfidence, averageConfidence + 0.04 * (frameCount - 1))) : maxConfidence).toFixed(4)),
        status,
        timestamp: new Date().toISOString(),
        imageBase64: group.imageBase64,
        reasoning: visionOnly
          ? frameCount >= consensusFrameCount
            ? `Vision-only consensus across ${frameCount} camera frames via local YOLO`
            : "Single high-confidence vision-only local YOLO detection"
          : frameCount >= consensusFrameCount
            ? `Consensus across ${frameCount} camera frames via local YOLO and optional sensor hints`
            : "Single high-confidence local YOLO detection",
      };
      if (status === "accepted") {
        accepted.push(item);
      } else {
        rejected.push(item);
      }
    }

    for (const candidate of rejectedCandidates) {
      if (!rejected.some((item) => item.detectedMaterial === candidate.item.detectedMaterial && item.confidence >= candidate.item.confidence)) {
        rejected.push({
          ...candidate.item,
          status: "rejected",
          timestamp: new Date().toISOString(),
          imageBase64: candidate.imageBase64,
          reasoning: "Below the acceptance confidence threshold",
        });
      }
    }

    accepted.sort((a, b) => b.confidence - a.confidence);
    rejected.sort((a, b) => b.confidence - a.confidence);
    const best = accepted[0] || rejected[0];
    const frameResult = frameDetections.find((frame) => frame.imageBase64 === best?.imageBase64)?.result;

    return {
      items: accepted,
      rejectedItems: rejected,
      imageBase64: best?.imageBase64 || frameDetections[frameDetections.length - 1].imageBase64,
      imageWidth: best?.imageWidth || frameResult?.imageWidth,
      imageHeight: best?.imageHeight || frameResult?.imageHeight,
      error: frameDetections.some((frame) => frame.result.error) ? "One or more detection frames reported an error" : undefined,
    };
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
        console.log(`📊 Detection result: ${multiResult.items.length} accepted item(s) found`);
        if (multiResult.items.length > 0) {
          console.log(
            `🔍 Detected ${multiResult.items.length} item(s):`,
            multiResult.items.map((i) => `${i.detectedMaterial} (${(i.confidence * 100).toFixed(1)}%)`).join(", ")
          );
        } else {
          console.log(`⚠️ No accepted items detected; ${multiResult.rejectedItems?.length || 0} candidate(s) rejected`);
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
