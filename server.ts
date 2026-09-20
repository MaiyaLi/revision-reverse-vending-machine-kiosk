import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import https from "https";
import fs from "fs";
import { spawn } from "child_process";
import cookieParser from "cookie-parser";
import csurf from "csurf";

// Import database services
import { db } from "./src/services/database";
import { userService } from "./src/services/userService";
import { depositService } from "./src/services/depositService";
import { payoutService } from "./src/services/payoutService";
import { operatorService } from "./src/services/operatorService";
import { receiptService } from "./src/services/receiptService";
import { detectionService } from "./src/services/detectionService";
import { printReceipt } from "./src/services/printerService";
import userRoutes from "./src/routes/userRoutes";

import type { ReceiptData } from "./src/services/receiptService";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const enableHttps = process.env.ENABLE_HTTPS === "true";
const sslKeyPath = process.env.SSL_KEY_PATH || "certs/key.pem";
const sslCertPath = process.env.SSL_CERT_PATH || "certs/cert.pem";
const defaultOrigins = [`http://localhost:${PORT}`];
if (process.env.APP_URL) defaultOrigins.push(process.env.APP_URL);
if (enableHttps) defaultOrigins.push(`https://localhost:${HTTPS_PORT}`);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || defaultOrigins.join(",")).split(",").map((o) => o.trim());

// CORS for mobile app / remote access — whitelist specific origins
app.use((req, res, next) => {
  const origin = req.header("Origin");
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

// ============================================
// CSRF PROTECTION
// ============================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore: Map<string, RateLimitEntry> = new Map();

function rateLimit(windowMs: number, max: number, message: string) {
  const limitKey = `${windowMs}:${max}`;

  const checkInMemory = (key: string, now: number) => {
    const entry = rateLimitStore.get(key);
    if (entry && entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
    const current = rateLimitStore.get(key);
    if (current && current.count >= max) {
      const retryAfter = Math.ceil((current.resetTime - now) / 1000);
      return { blocked: true, retryAfter, entry: current };
    }
    if (current) {
      current.count++;
    } else {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    }
    return { blocked: false };
  };

  return async (req: any, res: any, next: any) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const storeKey = `${limitKey}:${key}`;
    const now = Date.now();

    if (db.isConnected()) {
      try {
        const resetTime = new Date(now + windowMs);

        await db.query(
          `INSERT INTO rate_limits ("key", "count", "resetTime")
           VALUES ($1, 1, $2)
           ON CONFLICT ("key") DO UPDATE
           SET "count" = rate_limits."count" + 1,
               "resetTime" = CASE
                 WHEN rate_limits."resetTime" < NOW() THEN $2
                 ELSE rate_limits."resetTime"
               END`,
          [storeKey, resetTime]
        );

        const row = await db.queryOne(
          `SELECT "count", "resetTime" FROM rate_limits WHERE "key" = $1`,
          [storeKey]
        );

        if (row && new Date(row.resetTime).getTime() > now && row.count > max) {
          const retryAfter = Math.ceil((new Date(row.resetTime).getTime() - now) / 1000);
          res.setHeader('Retry-After', retryAfter);
          return res.status(429).json({ success: false, error: message });
        }

        next();
        return;
      } catch (error) {
        console.warn('Rate limit DB error, falling back to in-memory:', (error as Error).message);
      }
    }

    const result = checkInMemory(storeKey, now);
    if (result.blocked) {
      res.setHeader('Retry-After', result.retryAfter);
      return res.status(429).json({ success: false, error: message });
    }
    next();
  };
}

const csrfSecret = process.env.CSRF_SECRET || "revision-rvm-csrf-secret";

app.use(cookieParser(csrfSecret));
if (process.env.ENABLE_CSRF === "true") {
  app.use(csurf({
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600000,
    },
  }));
}

// Endpoint for clients to obtain a CSRF token
app.get("/api/csrf-token", (req: any, res: any) => {
  const token = typeof req.csrfToken === "function" ? req.csrfToken() : "csrf-disabled";
  res.json({ csrfToken: token });
});

// ============================================
// RATE LIMITING
// ============================================

// General rate limit: 100 requests per 15 minutes
app.use(rateLimit(15 * 60 * 1000, 100, 'Too many requests. Please try again later.'));

// Stricter rate limit for auth and wallet endpoints: 10 requests per minute
const authRateLimit = rateLimit(60 * 1000, 10, 'Too many authentication attempts. Please try again later.');

app.use('/api/auth', authRateLimit);
app.use('/api/payout/wallet', authRateLimit);
app.use('/api/wallet/credit', authRateLimit);
app.use('/api/redemption', authRateLimit);
app.use('/api/payout/disburse', authRateLimit);

// Stricter PIN brute-force protection: 5 attempts per 30 seconds
app.use('/api/auth/login', rateLimit(30 * 1000, 5, 'Too many login attempts. Please try again later.'));

// ============================================
// USER ROUTES
// ============================================

app.use("/api/user", userRoutes);

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: db.isConnected() ? 'connected' : 'disconnected'
  });
});

// ============================================
// AUTH ENDPOINTS
// ============================================

app.post("/api/auth/register", async (req, res) => {
  try {
    const { fullName, mobileNumber, pin, emailAddress, age, barangay, profilePhoto } = req.body;
    
    if (!fullName) {
      return res.status(400).json({ success: false, error: "Full name is required" });
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
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { credential, pin } = req.body;
    if (!credential || !pin) {
      return res.status(400).json({ success: false, error: "Mobile/ID and PIN are required" });
    }

    const user = await userService.loginUser(credential, pin);

    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid PIN or credentials" });
    }

    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DEPOSIT SESSION ENDPOINTS
// ============================================

app.post("/api/deposit/session/start", async (req, res) => {
  try {
    const { userId } = req.body;
    const sessionRefId = await depositService.createSession(userId || null);
    res.json({ success: true, sessionRefId });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/deposit/item/add", async (req, res) => {
  try {
    const { sessionRefId, item } = req.body;
    await depositService.addItem(sessionRefId, item);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post("/api/deposit/complete", async (req, res) => {
  try {
    const { sessionRefId, userId, itemsSummary, payoutMethod } = req.body;

    const session = await depositService.completeSession(sessionRefId, userId, payoutMethod || 'wallet');

    const transactionId = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;

    // Persist the receipt record so email/print endpoints can find it later
    try {
      await receiptService.createReceipt({
        sessionId: session.id,
        userId: userId || null,
        materialsDeposited: itemsSummary ? `${itemsSummary.plastic || 0} Plastics, ${itemsSummary.aluminum || 0} Cans, ${itemsSummary.glass || 0} Glass` : '',
        totalWeightKg: (session.totalWeightGrams || 0) / 1000,
        totalReward: session.totalPayout || 0,
        payoutMethod: payoutMethod || 'wallet',
        payoutStatus: 'COMPLETED',
        transactionId
      });
    } catch (receiptErr) {
      console.warn('Could not create receipt record:', (receiptErr as Error).message);
    }

    res.json({
      success: true,
      transactionId,
      timestamp: new Date().toISOString(),
      amountCredited: session.totalPayout,
      payoutMethod: payoutMethod || 'wallet',
      updatedUser: userId ? await userService.getUserById(userId) : null
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/deposit/session/:sessionRefId", async (req, res) => {
  try {
    const session = await depositService.getSession(req.params.sessionRefId);
    if (!session) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }
    res.json(session);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REDEMPTION ENDPOINTS
// ============================================

app.post("/api/redemption/withdraw", async (req, res) => {
  try {
    const { memberId, userId, payoutMethod, amount, provider } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid redemption amount" });
    }

    // Accept either memberId or userId
    const identifier = memberId || userId;
    if (!identifier) {
      return res.status(400).json({ success: false, error: "memberId or userId is required" });
    }

    const user = await userService.findUserByCredential(identifier);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (parseFloat(user.walletBalance) < amount) {
      return res.status(400).json({ success: false, error: "Insufficient wallet balance" });
    }

    // Update wallet balance
    const updatedUser = await userService.updateWalletBalance(
      user.id,
      -amount,
      'REDEMPTION',
      { details: `Withdrawal - ${payoutMethod || 'wallet'}` }
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
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PAYOUT ENDPOINTS
// ============================================

// Credit wallet balance (for wallet payout method)
app.post("/api/payout/wallet", async (req, res) => {
  try {
    const { userId, amount, sessionId } = req.body;

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid payout request" });
    }

    const user = await userService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const updatedUser = await userService.updateWalletBalance(
      user.id,
      amount,
      'DEPOSIT',
      { details: `Wallet payout${sessionId ? ` for session ${sessionId}` : ''}` }
    );

    res.json({
      success: true,
      transactionId: `TXN-${Math.floor(100000 + Math.random() * 900000)}`,
      timestamp: new Date().toISOString(),
      amountCredited: amount,
      updatedUser,
      payoutMethod: 'wallet'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/wallet/credit", async (req, res) => {
  try {
    const { userId, amount, details } = req.body;

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid credit request" });
    }

    const user = await userService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const updatedUser = await userService.updateWalletBalance(
      user.id,
      amount,
      'DEPOSIT',
      { details: `Wallet credit${details ? `: ${details}` : ''}` }
    );

    res.json({
      success: true,
      amountCredited: amount,
      updatedUser
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/redemption/coin-deposit", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid deposit amount" });
    }

    const user = await userService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const updatedUser = await userService.updateWalletBalance(
      user.id,
      amount,
      'DEPOSIT',
      { details: 'Coin deposit' }
    );

    res.json({
      success: true,
      transactionId: `TXN-${Math.floor(100000 + Math.random() * 900000)}`,
      timestamp: new Date().toISOString(),
      amountDeposited: amount,
      updatedUser
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create disbursement (for QRPH/bank payout method)
app.post("/api/payout/disburse", async (req, res) => {
  try {
    const { userId, amount, sessionId, channel, accountNumber, accountName } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid disbursement amount" });
    }

    if (userId) {
      const user = await userService.getUserById(userId);
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      if (user.walletBalance < amount) {
        return res.status(400).json({ success: false, error: "Insufficient wallet balance" });
      }
    }

    const disbursement = await operatorService.requestPayout({
      sessionId: sessionId || null,
      userId: userId || null,
      amount,
      channel: channel || 'GCASH',
      recipientPhone: accountNumber || '',
      recipientName: accountName || 'User'
    });

    res.json({
      success: true,
      transactionId: disbursement.referenceId,
      timestamp: new Date().toISOString(),
      amountDisbursed: amount,
      status: disbursement.status,
      payoutMethod: 'operator-qrph'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Record cash dispensed (for cash payout method)
app.post("/api/payout/cash", async (req, res) => {
  try {
    const { userId, amount, sessionId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid cash amount" });
    }

    const cashout = await payoutService.createCashDispense({
      sessionId: sessionId || '',
      userId: userId || null,
      amount
    });

    res.json({
      success: true,
      transactionId: cashout.externalId,
      timestamp: new Date().toISOString(),
      amountDispensed: amount,
      payoutMethod: 'cash'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/receipt/create", async (req, res) => {
  try {
    const receipt = await receiptService.createReceipt(req.body);
    res.json({ success: true, receipt });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/receipt/:transactionId", async (req, res) => {
  try {
    const receipt = await receiptService.getReceipt(req.params.transactionId);
    if (!receipt) {
      return res.status(404).json({ success: false, error: "Receipt not found" });
    }
    res.json(receipt);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/receipt/print/:transactionId", async (req, res) => {
  try {
    const { items, totalPoints, user } = req.body;

    if (items && totalPoints !== undefined) {
      const receiptData: ReceiptData = {
        items: items.map((item: any) => ({
          name: item.name || "Unknown",
          material: item.material || "other",
          weightGrams: item.weightGrams || 0,
          points: item.points || 0,
        })),
        totalPoints,
        user: user || { name: "Valued Customer" },
        timestamp: new Date().toISOString(),
        transactionId: req.params.transactionId,
      };

      const printed = await receiptService.printReceiptData(receiptData);
      res.json({ success: true, printed });
      return;
    }

    const result = await receiptService.printReceipt(req.params.transactionId);
    res.json({ success: true, printed: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test thermal printer
app.post("/api/printer/test", async (req, res) => {
  try {
    const testReceipt: ReceiptData = {
      items: [
        { name: "PET Bottle", material: "plastic", weightGrams: 22, points: 10 },
        { name: "Aluminum Can", material: "aluminum", weightGrams: 15, points: 8 },
      ],
      totalPoints: 18,
      user: { name: "Test User" },
      timestamp: new Date().toISOString(),
      transactionId: `TXN-TEST-${Date.now()}`,
    };
    const printed = await receiptService.printReceiptData(testReceipt);
    res.json({ success: true, printed, message: printed ? "Test receipt sent to printer" : "Printer not available" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test raw printer commands
app.post("/api/printer/raw-test", async (req, res) => {
  try {
    const result = await receiptService.testPrinterCommands();
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/receipt/email/:transactionId", async (req, res) => {
  try {
    const { emailAddress } = req.body;
    await receiptService.sendViaEmail(req.params.transactionId, emailAddress);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CAMERA ENDPOINTS
// ============================================

// Start rpicam-vid as a persistent MJPEG stream
let mjpegStreamProc: any = null;
let mjpegStreamPath: string | null = null;

function startMjpegStream() {
  if (mjpegStreamProc) return;
  const streamPath = "/tmp/rvm-mjpeg-stream.mjpeg";
  const proc = spawn("rpicam-vid", [
    "-t", "0",
    "--codec", "mjpeg",
    "--width", "640",
    "--height", "480",
    "--framerate", "15",
    "-o", streamPath
  ], {
    stdio: ["ignore", "ignore", "ignore"]
  });

  proc.on("error", (err: Error) => {
    console.error("MJPEG stream process error:", err.message);
  });

  proc.on("close", () => {
    mjpegStreamProc = null;
  });

  mjpegStreamProc = proc;
  mjpegStreamPath = streamPath;
}

function stopMjpegStream() {
  if (mjpegStreamProc) {
    mjpegStreamProc.kill();
    mjpegStreamProc = null;
  }
  mjpegStreamPath = null;
}

// Serve a continuous MJPEG stream from rpicam-vid
app.get("/api/camera/stream", (req, res) => {
  res.setHeader("Content-Type", "multipart/x-mixed-replace;boundary=frame");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "close");

  let proc: any;
  let cleanedUp = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (timeout) clearTimeout(timeout);
    if (proc) proc.kill();
    res.end();
  };

  try {
    proc = spawn("rpicam-vid", [
      "-t", "0",
      "--codec", "mjpeg",
      "--width", "640",
      "--height", "480",
      "--framerate", "15",
      "-o", "-"
    ], {
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Camera unavailable" });
    return;
  }

  if (proc) {
    proc.on("error", cleanup);
  }

  const boundary = "frame";
  let buffer = Buffer.alloc(0);

  req.on("close", cleanup);
  req.on("abandoned", cleanup);

  proc.stdout.on("data", (data: Buffer) => {
    // MJPEG frames are independent, just flush everything
    buffer = Buffer.concat([buffer, data]);
    try {
      res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`);
      res.write(data);
      res.write("\r\n");
    } catch (e) {
      // Client disconnected
      cleanup();
    }
  });

  proc.stderr.on("data", () => {
    // Silently discard stderr
  });

  proc.on("close", cleanup);

  // Set a timeout to prevent hanging
  timeout = setTimeout(cleanup, 30000);
});

// Serve single JPEG snapshot (fallback for browsers that don't support MJPEG)
app.get("/api/camera/snapshot", async (req, res) => {
  try {
    const tmpFile = `/tmp/rvm-cam-${Date.now()}.jpg`;
    const { execSync } = await import("child_process");

    try {
      execSync(`rpicam-still -o ${tmpFile} --width 640 --height 480 --nopreview --timeout 100`, {
        stdio: "ignore",
        timeout: 5000
      });
    } catch (firstError) {
      try {
        execSync("killall -9 detector.py 2>/dev/null; kill $(pgrep -f frigate) 2>/dev/null; sleep 1", { stdio: "ignore", timeout: 5000 });
      } catch {}
      execSync(`rpicam-still -o ${tmpFile} --width 640 --height 480 --nopreview --timeout 100`, {
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
    execSync(`rpicam-still -o ${tmpFile} --width 640 --height 480 --nopreview --timeout 100`, {
      stdio: "ignore",
      timeout: 5000
    });
    res.sendFile(tmpFile, {}, (err) => {
      try { fs.unlinkSync(tmpFile); } catch {}
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// COMPUTER VISION / WASTE DETECTION
// ============================================

app.post("/api/detect-waste", async (req, res) => {
  try {
    const { imageBase64, inductiveReading, weightGrams, visionOnly } = req.body;

    const detectionOptions: { inductiveReading?: boolean; weightGrams?: number; visionOnly?: boolean } = {};
    if (typeof inductiveReading === "boolean") detectionOptions.inductiveReading = inductiveReading;
    if (typeof weightGrams === "number" && weightGrams > 0) detectionOptions.weightGrams = weightGrams;
    if (typeof visionOnly === "boolean") detectionOptions.visionOnly = visionOnly;

    const result = await detectionService.detectMultipleItems(imageBase64, detectionOptions);
    const detected = (result.items && result.items[0]) || (result.rejectedItems && result.rejectedItems[0]);

    if (!detected) {
      return res.status(404).json({
        success: false,
        error: "No item detected in image",
        timestamp: result.timestamp,
      });
    }

    const materialType = detected.detectedMaterial;

    res.json({
      success: true,
      detectedMaterial: materialType,
      itemName: detected.itemName,
      confidence: detected.confidence,
      estimatedWeightGrams: detected.estimatedWeightGrams,
      status: detected.status,
      reasoning: detected.reasoning,
      payoutPhilippinePesos: detected.status === "accepted" && materialType === "plastic" ? 1.0 : detected.status === "accepted" && materialType === "aluminum" ? 2.5 : detected.status === "accepted" && materialType === "glass" ? 1.5 : 0,
      ecoPointsEarned: detected.status === "accepted" && materialType === "plastic" ? 10 : detected.status === "accepted" && materialType === "aluminum" ? 25 : detected.status === "accepted" && materialType === "glass" ? 15 : 0,
      co2ReductionKg: detected.status === "accepted" && materialType === "plastic" ? 0.04 : detected.status === "accepted" && materialType === "aluminum" ? 0.09 : detected.status === "accepted" && materialType === "glass" ? 0.06 : 0,
      boundingBox: detected.boundingBox,
      imageWidth: detected.imageWidth,
      imageHeight: detected.imageHeight
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CONTINUOUS DETECTION / TEST VIEW ENDPOINTS
// ============================================

// Get last captured image (for test view)
app.get("/api/detection/image", (req, res) => {
  const img = detectionService.getLastImage();
  if (!img) {
    res.status(404).json({ success: false, error: "No image available" });
  } else {
    res.json({ imageBase64: img });
  }
});

// Trigger a manual detection (for testing)
// Run detection - returns all detected items
app.post("/api/detection/run", async (req, res) => {
  try {
    const { imageBase64, inductiveReading, weightGrams, visionOnly } = req.body;

    const detectionOptions: { inductiveReading?: boolean; weightGrams?: number; visionOnly?: boolean } = {};
    if (typeof inductiveReading === "boolean") detectionOptions.inductiveReading = inductiveReading;
    if (typeof weightGrams === "number" && weightGrams > 0) detectionOptions.weightGrams = weightGrams;
    if (typeof visionOnly === "boolean") detectionOptions.visionOnly = visionOnly;

    const result = await detectionService.detectMultipleItems(imageBase64, detectionOptions);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get latest multi-detection result
app.get("/api/detection/latest", async (req, res) => {
  try {
    const latest = detectionService.getHistory()[0];
    if (!latest) {
      const dbLatest = (await detectionService.getHistoryFromDb(1))[0];
      if (!dbLatest) {
        return res.status(404).json({ success: false, error: "No detections yet" });
      }
      return res.json(dbLatest);
    }
    res.json(latest);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all detection history (from database if available, falls back to in-memory)
app.get("/api/detection/history", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const history = await detectionService.getHistoryFromDb(limit);
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start background detection service
app.post("/api/detection/background/start", (req, res) => {
  try {
    const interval = parseInt(req.body?.intervalMs) || 15000;
    detectionService.startBackgroundDetection(interval);
    res.json({ success: true, message: `Background detection started (interval: ${interval}ms)` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop background detection service
app.post("/api/detection/background/stop", (req, res) => {
  try {
    detectionService.stopBackgroundDetection();
    res.json({ success: true, message: "Background detection stopped" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
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
      app.use(express.static(path.join(process.cwd(), "public")));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    const startListening = (listenApp: typeof app, port: number, protocol: string) => {
      listenApp.listen(Number(port), "0.0.0.0", () => {
        console.log(`✅ ReVision Reverse Vending Machine Kiosk Server running on port ${port} (${protocol})`);
        if (protocol === 'HTTP') {
          console.log('⚠️  WARNING: Running in HTTP mode. Set ENABLE_HTTPS=true for TLS encryption.');
        }
        console.log(`📊 Transaction system: ENABLED (PostgreSQL)`);

        // Start background detection service automatically
        detectionService.startBackgroundDetection(15000);
        console.log(`🔍 Background camera detection started (interval: 15000ms)`);
      });
    };

    if (enableHttps) {
      let key: Buffer | undefined;
      let cert: Buffer | undefined;
      try {
        key = fs.readFileSync(sslKeyPath);
        cert = fs.readFileSync(sslCertPath);
      } catch {
        console.warn(`⚠️  SSL cert/key not found at ${sslCertPath}/${sslKeyPath}`);
        console.log('🔧 Generating self-signed certificate for development...');
        try {
          const { execSync } = await import("child_process");
          const certDir = path.dirname(sslCertPath);
          if (!fs.existsSync(certDir)) {
            fs.mkdirSync(certDir, { recursive: true });
          }
          execSync(
            `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${sslKeyPath}" -out "${sslCertPath}" -days 365 -subj "/CN=localhost"`,
            { stdio: "ignore", timeout: 30000 }
          );
          key = fs.readFileSync(sslKeyPath);
          cert = fs.readFileSync(sslCertPath);
          console.log(`✅ Self-signed certificate generated at ${sslCertPath}`);
        } catch (certError) {
          console.error('❌ Failed to generate self-signed certificate:', (certError as Error).message);
          console.error('   Falling back to HTTP. Install openssl or provide SSL_KEY_PATH/SSL_CERT_PATH.');
          startListening(app, Number(PORT), 'HTTP');
          return;
        }
      }

      if (key && cert) {
        https.createServer({ key, cert }, app).listen(Number(HTTPS_PORT), "0.0.0.0", () => {
          console.log(`✅ ReVision Reverse Vending Machine Kiosk Server running on port ${HTTPS_PORT} (HTTPS/TLS)`);
          console.log(`📊 Transaction system: ENABLED (PostgreSQL)`);

          // Start background detection service automatically
          detectionService.startBackgroundDetection(15000);
          console.log(`🔍 Background camera detection started (interval: 15000ms)`);
        });
      } else {
        startListening(app, Number(PORT), 'HTTP');
      }
    } else {
      startListening(app, Number(PORT), 'HTTP');
    }
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// CSRF error handler — must be after all routes
app.use((err: any, req: any, res: any, next: any) => {
  if (err.code === "EBADCSRFTOKEN") {
    return res.status(403).json({ success: false, error: "Invalid CSRF token" });
  }
  next(err);
});

startServer();
