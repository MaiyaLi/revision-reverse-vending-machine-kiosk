import { spawn } from "child_process";
import fs from "fs";
import path from "path";

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

export class LocalDetectionService {
  private pythonScript: string;
  private modelPath: string;
  private pythonBin: string;

  constructor() {
    this.pythonScript = path.join(process.cwd(), "scripts", "yolo_detect.py");
    this.modelPath = path.join(process.cwd(), "models", "yolov8n.pt");
    this.pythonBin = path.join(process.cwd(), ".venv", "bin", "python");
  }

  async detectFromImage(imageBase64: string): Promise<MultiDetectionResult> {
    try {
      const tmpFile = `/tmp/rvm-local-detect-${Date.now()}.jpg`;
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      fs.writeFileSync(tmpFile, Buffer.from(base64Data, "base64"));

      const result = await this.runPythonDetect(tmpFile);
      fs.unlinkSync(tmpFile);

      return {
        items: result.items,
        timestamp: new Date().toISOString(),
        imageBase64,
      };
    } catch (error: any) {
      const message = error?.message || String(error);
      console.error("Local detection error:", message);
      return {
        items: [],
        timestamp: new Date().toISOString(),
        imageBase64: imageBase64,
        error: message,
      };
    }
  }

  private runPythonDetect(imagePath: string): Promise<{ items: DetectionResult[] }> {
    return new Promise((resolve, reject) => {
      const args = [this.pythonScript, imagePath];
      if (fs.existsSync(this.modelPath)) {
        args.push(this.modelPath);
      }

      const python = spawn(this.pythonBin, args, { timeout: 30000 });
      let stdout = "";
      let stderr = "";

      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      python.on("close", (code) => {
        if (code !== 0) {
          return reject(new Error(`Python exited with ${code}: ${stderr}`));
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed.error) {
            return reject(new Error(parsed.error));
          }
          return resolve(parsed);
        } catch (e) {
          return reject(new Error(`Invalid JSON: ${stdout}`));
        }
      });

      python.on("error", (err) => {
        reject(new Error(`Failed to start python: ${err.message}`));
      });
    });
  }
}

export const localDetectionService = new LocalDetectionService();
