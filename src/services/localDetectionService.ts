import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

function getServiceDir(): string {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
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

export interface DetectionOptions {
  inductiveReading?: boolean;
  weightGrams?: number;
  visionOnly?: boolean;
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

export class LocalDetectionService {
  private readonly projectRoot: string;
  private readonly pythonScript: string;
  private readonly modelPath: string;
  private readonly pythonBin: string;

  constructor() {
    const serviceDir = getServiceDir();
    const sourceRoot = path.resolve(serviceDir, "..", "..");
    const distributionRoot = path.resolve(serviceDir, "..");
    const candidateRoots = [process.cwd(), sourceRoot, distributionRoot];
    this.projectRoot =
      candidateRoots.find((root) => fs.existsSync(path.join(root, "scripts", "yolo_detect.py"))) || process.cwd();
    this.pythonScript = path.join(this.projectRoot, "scripts", "yolo_detect.py");
    this.modelPath = process.env.YOLO_MODEL_PATH || path.join(this.projectRoot, "models", "yolov8n.pt");

    const pythonCandidates = [
      path.join(this.projectRoot, ".venv", "bin", "python"),
      path.join(this.projectRoot, ".venv", "Scripts", "python.exe"),
      process.env.PYTHON_BIN || "",
    ].filter(Boolean);
    this.pythonBin = pythonCandidates.find((candidate) => fs.existsSync(candidate)) || (process.platform === "win32" ? "python" : "python3");
  }

  async detectFromImage(imageBase64: string, options: DetectionOptions = {}): Promise<MultiDetectionResult> {
    const tmpFile = path.join(os.tmpdir(), `rvm-local-detect-${process.pid}-${Date.now()}.jpg`);
    try {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "").trim();
      if (!base64Data) {
        throw new Error("Image data is empty");
      }

      fs.writeFileSync(tmpFile, Buffer.from(base64Data, "base64"));
      const result = await this.runPythonDetect(tmpFile, options);

      return {
        items: result.items,
        rejectedItems: result.rejectedItems,
        timestamp: new Date().toISOString(),
        imageBase64,
        imageWidth: result.imageWidth,
        imageHeight: result.imageHeight,
      };
    } catch (error: any) {
      const message = error?.message || String(error);
      console.error("Local detection error:", message);
      return {
        items: [],
        rejectedItems: [],
        timestamp: new Date().toISOString(),
        imageBase64,
        error: message,
      };
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {}
    }
  }

  private runPythonDetect(imagePath: string, options: DetectionOptions): Promise<MultiDetectionResult> {
    return new Promise((resolve, reject) => {
      const args = [this.pythonScript, imagePath, this.modelPath];
      const visionOnly =
        options.visionOnly === true ||
        (!options.inductiveReading && !(options.weightGrams && options.weightGrams > 0));
      if (options.inductiveReading) {
        args.push("--inductive");
      }
      if (options.weightGrams && options.weightGrams > 0) {
        args.push("--weight", String(options.weightGrams));
      }
      if (visionOnly) {
        args.push("--vision-only");
      }

      const python = spawn(this.pythonBin, args, { timeout: 30000, windowsHide: true });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      python.on("error", (err) => {
        fail(new Error(`Failed to start Python detection: ${err.message}`));
      });

      python.on("close", (code) => {
        if (settled) return;
        if (code !== 0) {
          fail(new Error(`Python detection exited with ${code}: ${stderr || "no error output"}`));
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed.error) {
            fail(new Error(parsed.error));
            return;
          }
          if (!Array.isArray(parsed.items)) {
            fail(new Error("Python detection returned an invalid result"));
            return;
          }

          const normalize = (item: any): DetectionResult => ({
            detectedMaterial: ["plastic", "aluminum", "glass", "other"].includes(item.detectedMaterial)
              ? item.detectedMaterial
              : "other",
            itemName: String(item.itemName || "Unknown item"),
            confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0,
            estimatedWeightGrams: Number.isFinite(Number(item.estimatedWeightGrams))
              ? Math.round(Number(item.estimatedWeightGrams))
              : 0,
            status: item.status === "rejected" ? "rejected" : "accepted",
            timestamp: new Date().toISOString(),
            imageBase64: null,
            reasoning: "Detected via local YOLO model",
            boundingBox: item.boundingBox,
            imageWidth: Number(item.imageWidth) || undefined,
            imageHeight: Number(item.imageHeight) || undefined,
          });

          resolve({
            items: parsed.items.filter((item: any) => item.status !== "rejected").map(normalize),
            rejectedItems: (Array.isArray(parsed.rejectedItems) ? parsed.rejectedItems : parsed.items)
              .filter((item: any) => item.status === "rejected")
              .map(normalize),
            timestamp: new Date().toISOString(),
            imageBase64: null,
            imageWidth: Number(parsed.imageWidth) || undefined,
            imageHeight: Number(parsed.imageHeight) || undefined,
          });
        } catch (error) {
          fail(new Error(`Invalid JSON from Python detection: ${stdout}`));
        }
      });
    });
  }
}

export const localDetectionService = new LocalDetectionService();
