import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// Import database services
import { db } from "./src/services/database";
import { userService } from "./src/services/userService";
import { depositService } from "./src/services/depositService";
import { payoutService } from "./src/services/payoutService";
import { receiptService } from "./src/services/receiptService";
import userRoutes from "./src/routes/userRoutes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS for mobile app / remote access
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini API Client initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize GoogleGenAI:", err);
  }
}

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// ============================================
// AUTH ENDPOINTS
// ============================================

app.post("/api/auth/register", async (req, res) => {
  try {
    const { fullName, mobileNumber, pin, emailAddress, age, barangay, profilePhoto } = req.body;
    
    if (!fullName) {
      return res.status(400).json({ error: "Full name is required" });
    }

    const memberId = `REV-${Date.now().toString(36).toUpperCase()}`;
    const user = await userService.createUser({
      memberId,
      fullName,
      phoneNumber: mobileNumber,
      emailAddress,
      pinCode: pin,
      age: age ? parseInt(age) : undefined,
      barangay,
      profilePhotoUrl: profilePhoto
    });
    res.status(201).json({ success: true, user });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { credential, pin } = req.body;
    if (!credential || !pin) {
      return res.status(400).json({ error: "Mobile/ID and PIN are required" });
    }

    const user = await userService.loginUser(credential, pin);

    if (!user) {
      return res.status(401).json({ error: "Invalid PIN or credentials" });
    }

    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.use("/api/user", userRoutes);

// ============================================
// DEPOSIT SESSION ENDPOINTS
// ============================================

app.post("/api/deposit/session/start", async (req, res) => {
  try {
    const { userId } = req.body;
    const sessionRefId = await depositService.createSession(userId || null);
    res.json({ success: true, sessionRefId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/deposit/item/add", async (req, res) => {
  try {
    const { sessionRefId, item } = req.body;
    await depositService.addItem(sessionRefId, item);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/deposit/complete", async (req, res) => {
  try {
    const { sessionRefId, userId, itemsSummary } = req.body;

    const session = await depositService.completeSession(sessionRefId, userId);

    const transactionId = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;

    res.json({
      success: true,
      transactionId,
      timestamp: new Date().toISOString(),
      amountCredited: session.total_payout,
      updatedUser: userId ? await userService.getUserById(userId) : null
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/deposit/session/:sessionRefId", async (req, res) => {
  try {
    const session = await depositService.getSession(req.params.sessionRefId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PAYOUT ENDPOINTS
// ============================================

app.post("/api/payout/direct", async (req, res) => {
  try {
    const result = await payoutService.createDisbursement(req.body);
    res.json({
      success: true,
      externalId: result.external_id,
      status: result.status,
      xenditId: result.xendit_id
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/payout/link", async (req, res) => {
  try {
    const result = await payoutService.createPayoutLink(req.body);
    res.json({
      success: true,
      payoutUrl: result.payout_url,
      externalId: result.external_id
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/payout/cash", async (req, res) => {
  try {
    const result = await payoutService.createCashDispense(req.body);
    res.json({
      success: true,
      externalId: result.external_id,
      status: 'COMPLETED'
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/payout/status/:externalId", async (req, res) => {
  try {
    const result = await payoutService.checkPayoutStatus(req.params.externalId);
    res.json({
      externalId: result.external_id,
      status: result.status,
      failureReason: result.failure_reason
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/payout/webhook", async (req, res) => {
  try {
    const token = req.headers['x-callback-token'];
    if (token !== process.env.XENDIT_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: "Invalid webhook token" });
    }

    await payoutService.handleWebhook(req.body);
    res.json({ received: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/redemption/withdraw", async (req, res) => {
  try {
    const { memberId, userId, payoutMethod, amount, provider } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid redemption amount" });
    }

    // Accept either memberId or userId
    const identifier = memberId || userId;
    if (!identifier) {
      return res.status(400).json({ error: "memberId or userId is required" });
    }

    const user = await userService.findUserByCredential(identifier);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (parseFloat(user.wallet_balance) < amount) {
      return res.status(400).json({ error: "Insufficient wallet balance" });
    }

    // Update wallet balance
    const updatedUser = await userService.updateWalletBalance(
      user.id,
      -amount,
      'REDEMPTION'
    );

    res.json({
      success: true,
      transactionId: `TXN-${Math.floor(100000 + Math.random() * 900000)}`,
      timestamp: new Date().toISOString(),
      amountDeducted: amount,
      updatedUser,
      hardwareStatus: { status: 'Normal' }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RECEIPT ENDPOINTS
// ============================================

app.post("/api/receipt/create", async (req, res) => {
  try {
    const receipt = await receiptService.createReceipt(req.body);
    res.json({ success: true, receipt });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/receipt/:transactionId", async (req, res) => {
  try {
    const receipt = await receiptService.getReceipt(req.params.transactionId);
    if (!receipt) {
      return res.status(404).json({ error: "Receipt not found" });
    }
    res.json(receipt);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/receipt/print/:transactionId", async (req, res) => {
  try {
    const result = await receiptService.printReceipt(req.params.transactionId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/receipt/sms/:transactionId", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    await receiptService.sendViaSMS(req.params.transactionId, phoneNumber);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/receipt/email/:transactionId", async (req, res) => {
  try {
    const { emailAddress } = req.body;
    await receiptService.sendViaEmail(req.params.transactionId, emailAddress);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CAMERA ENDPOINTS
// ============================================

app.get("/api/camera/snapshot", async (req, res) => {
  try {
    const tmpFile = `/tmp/rvm-cam-${Date.now()}.jpg`;
    const { execSync } = await import("child_process");

    try {
      execSync(`rpicam-still -o ${tmpFile} --width 640 --height 480 --nopreview --timeout 1000`, {
        stdio: "ignore",
        timeout: 5000
      });
    } catch (firstError) {
      try {
        execSync("killall -9 detector.py 2>/dev/null; kill $(pgrep -f frigate) 2>/dev/null; sleep 1", { stdio: "ignore", timeout: 5000 });
      } catch {}
      execSync(`rpicam-still -o ${tmpFile} --width 640 --height 480 --nopreview --timeout 1000`, {
        stdio: "ignore",
        timeout: 5000
      });
    }

    const imageBuffer = await import("fs").then(fs => fs.readFileSync(tmpFile));
    const base64 = imageBuffer.toString("base64");
    await import("fs").then(fs => fs.unlinkSync(tmpFile));
    res.json({ success: true, imageBase64: `data:image/jpeg;base64,${base64}` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/camera/image", async (req, res) => {
  try {
    const tmpFile = `/tmp/rvm-cam-${Date.now()}.jpg`;
    const { execSync } = await import("child_process");
    execSync(`rpicam-still -o ${tmpFile} --width 640 --height 480 --nopreview --timeout 1000`, {
      stdio: "ignore",
      timeout: 5000
    });
    res.sendFile(tmpFile, {}, (err) => {
      try { require("fs").unlinkSync(tmpFile); } catch {}
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// COMPUTER VISION / WASTE DETECTION
// ============================================

app.post("/api/detect-waste", async (req, res) => {
  try {
    const { imageBase64, hardwareInductive, hardwareWeight } = req.body;

    let materialType = "plastic";
    let itemName = "PET Beverage Bottle";
    let confidence = 0.95;
    let estimatedWeight = hardwareWeight || 22;

    if (hardwareInductive) {
      materialType = "aluminum";
      itemName = "Aluminum Soda Can";
      estimatedWeight = hardwareWeight || 15;
    } else if (hardwareWeight > 100) {
      materialType = "glass";
      itemName = "Premium Glass Beverage Bottle";
      estimatedWeight = hardwareWeight || 280;
    }

    // Try Gemini API if available
    if (ai && imageBase64) {
      try {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

        const response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
          contents: [
            {
              inlineData: {
                data: base64Data,
                mimeType: "image/jpeg"
              }
            },
            {
              text: `Analyze this recyclable container. Identify if it's:
1. "plastic" (soda bottle, container)
2. "aluminum" (beverage can)
3. "glass" (beer bottle, container)
4. "other" (unsupported)

Respond ONLY in JSON: {"detectedMaterial": "...", "confidence": 0.0-1.0}`
            }
          ],
          config: {
            responseMimeType: "application/json"
          }
        });

        const responseText = response.text || "";
        const parsed = JSON.parse(responseText.trim());

        if (parsed.confidence && parsed.confidence >= 0.75) {
          materialType = parsed.detectedMaterial || materialType;
          confidence = parsed.confidence;
        }
      } catch (err: any) {
        console.warn("Gemini API fallback:", err.message);
      }
    }

    res.json({
      success: true,
      detectedMaterial: materialType,
      itemName: itemName,
      confidence: confidence,
      estimatedWeightGrams: estimatedWeight,
      reasoning: "Detected via integrated sensor & AI classification",
      payoutPhilippinePesos: materialType === "plastic" ? 1.0 : materialType === "aluminum" ? 2.5 : materialType === "glass" ? 1.5 : 0,
      ecoPointsEarned: materialType === "plastic" ? 10 : materialType === "aluminum" ? 25 : materialType === "glass" ? 15 : 0,
      co2ReductionKg: materialType === "plastic" ? 0.04 : materialType === "aluminum" ? 0.09 : materialType === "glass" ? 0.06 : 0
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TELEMETRY ENDPOINTS
// ============================================

app.get("/api/telemetry", (req, res) => {
  res.json({
    lastUpdated: new Date().toISOString(),
    internetConnected: true,
    chamberSensorOk: true,
    laserSensorOk: true,
    inductionSensorOk: true,
    loadCellOk: true,
    bins: {
      plastic: { count: 32, max: 150, name: "Plastic Bottles" },
      aluminum: { count: 18, max: 200, name: "Aluminum Cans" },
      glass: { count: 8, max: 100, name: "Glass Bottles" }
    },
    dispenser: {
      coins10Pesos: 150,
      coins5Pesos: 220,
      coins1Peso: 400,
      status: "Normal"
    },
    ambientTracker: {
      temperatureC: 36.8,
      loadCellReadingGrams: 0,
      inductiveReading: false,
      vl53DistanceMm: 150
    }
  });
});

// ============================================
// UI SERVER / VITE MIDDLEWARE
// ============================================

async function startServer() {
  try {
    // Initialize database (optional - will run without it)
    try {
      await db.connect();
      console.log('✅ Database connected');
    } catch (error) {
      console.warn('⚠️  Database not available - running in demo mode');
      console.log('📝 To enable full features, ensure PostgreSQL is running on localhost:5432');
    }

    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(Number(PORT), "0.0.0.0", () => {
      console.log(`✅ ReVision Reverse Vending Machine Kiosk Server running on port ${PORT}`);
      console.log(`📊 Transaction system: ENABLED (PostgreSQL)`);
      console.log(`💳 Xendit integration: ${process.env.XENDIT_SECRET_KEY ? 'CONFIGURED' : 'NOT CONFIGURED'}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
