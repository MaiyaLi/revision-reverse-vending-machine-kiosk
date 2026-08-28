# 🔍 COMPREHENSIVE CODE AUDIT REPORT
## ReVision Reverse Vending Machine Kiosk

**Audit Date:** August 27, 2026  
**Status:** Production-Ready Assessment  
**Critical Blockers:** 7 | **Integration Gaps:** 12 | **Edge Cases:** 8

---

## 📊 EXECUTIVE SUMMARY

This is a **fully mocked prototype** with excellent UI/UX but **multiple critical blockers** preventing real hardware operation and live payment processing. The application successfully simulates the end-to-end recycling workflow but requires substantial backend integration work for production deployment.

### Key Findings:
- ✅ **Frontend UI/UX:** Polished, accessible, multi-language support
- ✅ **State Management:** Well-structured state machine flow
- ❌ **Hardware Integration:** Completely stubbed (no real serial/hardware communication)
- ❌ **Payment Processing:** Mocked Xendit integration with no webhook handlers
- ❌ **Computer Vision:** Relies on dummy Gemini API calls with fallback mock logic
- ❌ **Error Handling:** Missing exception handling for hardware failures, timeouts, network issues
- ❌ **Transaction Logging:** No persistent transaction database beyond in-memory state

---

## 🚨 SECTION 1: MOCK DATA, TODOs & STUBBED LOGIC

### 1.1 Dummy Delays (setTimeout/setInterval Simulation)

**File:** `src/App.tsx`

#### Issue: Item verification uses hardcoded delays instead of real hardware signals
```typescript
// Lines 407, 426, 429, 432, 435 - STUBBED SENSOR STAGES
await new Promise(r => setTimeout(r, 1200));  // CAMERA stage - no real image processing
setVerificationStage('INDUCTIVE');
await new Promise(r => setTimeout(r, 1000));  // No real inductive sensor sampling

setVerificationStage('WEIGHT');
await new Promise(r => setTimeout(r, 1000));  // No real load cell reading

setVerificationStage('TOF');
await new Promise(r => setTimeout(r, 1000));  // No real VL53L0X distance measurement

setVerificationStage('SORTING');
await new Promise(r => setTimeout(r, 1200));  // No real solenoid actuation
```

**Problem:** Each stage has a hardcoded delay instead of waiting for actual hardware response. If a sensor fails, timeout, or jamming occurs, the system blindly proceeds.

**Production Requirement:** Replace with actual hardware event listeners:
```typescript
// SHOULD BE: Real hardware interface
const cameraFrame = await hardwareInterface.captureFrame(timeoutMs = 5000);
const inductiveReading = await hardwareInterface.readInductiveSensor();
const weight = await hardwareInterface.getLoadCellReading();
const distance = await hardwareInterface.readTOFSensor();
```

---

### 1.2 Telemetry Mock State

**File:** `src/App.tsx` (lines 201-225) & `server.ts` (lines 111-135)

#### Issue: Hardware status is hardcoded and never reflects real device state
```typescript
// App.tsx - EMBEDDED MOCK
const [telemetry, setTelemetry] = useState<SystemTelemetry>({
  internetConnected: true,           // HARDCODED - never updates
  chamberSensorOk: true,             // HARDCODED
  laserSensorOk: true,               // HARDCODED
  inductionSensorOk: true,           // HARDCODED
  loadCellOk: true,                  // HARDCODED
  bins: {
    plastic: { count: 32, max: 150 },   // Manual values only
    aluminum: { count: 18, max: 200 },
    glass: { count: 8, max: 100 }
  },
  dispenser: {
    coins10Pesos: 150,               // Never decremented on actual coins dispensed
    coins5Pesos: 220,
    coins1Peso: 400,
    status: "Normal"                 // Never set to "Low" or "Empty"
  },
  ambientTracker: {
    temperatureC: 36.8,              // STATIC - no real temperature sensor
    loadCellReadingGrams: 0,         // HARDCODED
    inductiveReading: false,         // HARDCODED
    vl53DistanceMm: 150              // HARDCODED
  }
});
```

**Production Requirement:**
- Connect to actual ESP32/Arduino firmware via serial or HTTP API
- Poll real sensor values every 500ms
- Track bin capacity changes in persistent database
- Monitor dispenser coin levels and trigger maintenance alerts

---

### 1.3 Computer Vision Classification (Gemini API)

**File:** `server.ts` (lines 474-572)

#### Issue: Fallback mock classification is too simplistic
```typescript
// Lines 478-500 - DUMMY LOGIC
if (hardwareInductive) {
  materialType = "aluminum";
  itemName = "Aluminum Soda Can";
  reasoning = "Inductive sensor captured...";  // Assumed classification
} else if (hardwareWeight > 100) {
  materialType = "glass";
  itemName = "Premium Glass Beverage Bottle";
  reasoning = "High mechanical stiffness...";   // Assumed classification
}

// Lines 503-559 - GEMINI API CALL (unreliable)
if (ai && imageBase64) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",   // Fixed model - may be deprecated
      contents: [...],
      config: { responseMimeType: "application/json" }
    });
    // Parse response and extract classification
  } catch (err) {
    console.error("Gemini API call failed, using sensory smart model", err);
    // Falls back to dummy logic above
  }
}
```

**Problems:**
1. **No image validation:** Accepts any base64 string without verifying image format
2. **No confidence threshold:** Even low-confidence classifications (0.1) are accepted
3. **Hardcoded model:** `gemini-3.5-flash` may be deprecated or unavailable
4. **Missing retry logic:** Single failure causes fallback to dummy classification
5. **No weight-image cross-validation:** Doesn't verify if classified material matches measured weight

**Production Fixes:**
```typescript
// Add validation layer
if (confidence < 0.85) {
  return { status: 'REJECTED', reason: 'Low confidence classification' };
}

// Validate image before processing
const validateImage = (base64: string) => {
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 5242880) throw new Error('Image > 5MB');  // Limit
  if (!buffer.toString('hex').startsWith('ffd8ff')) throw new Error('Not JPEG');
};

// Cross-check with weight sensor
const materialDensityRanges = {
  plastic: { min: 0.9, max: 1.4, avgWeight: 20 },   // g/cm³ and typical item weight
  aluminum: { min: 2.7, max: 2.8, avgWeight: 14 },
  glass: { min: 2.5, max: 2.8, avgWeight: 280 }
};

if (Math.abs(hardwareWeight - materialDensityRanges[material].avgWeight) > 100) {
  return { status: 'REJECTED', reason: 'Weight mismatch' };
}
```

---

### 1.4 User Database (In-Memory Only)

**File:** `server.ts` (lines 48-90)

#### Issue: All user data is lost on server restart
```typescript
const usersDb: Record<string, UserProfile> = {
  "REV-10024": { /* Hardcoded demo user */ },
  "REV-54910": { /* Hardcoded demo user */ }
};

const userTransactions: Record<string, TransactionHistory[]> = {
  "REV-10024": [/* Hardcoded transactions */],
  "REV-54910": [/* Hardcoded transactions */]
};

const payoutsDb: Record<string, PayoutTransaction> = {};  // Lost on restart!
```

**Impact:** 
- New users registered during a session are lost when server restarts
- Payout transaction history is not persisted
- No audit trail for compliance or debugging

---

### 1.5 Deposit Complete Flow - Missing Transaction Logging

**File:** `src/App.tsx` (lines 478-539) & `server.ts` (lines 365-407)

#### Issue: Deposits don't create persistent transaction records
```typescript
// App.tsx - Only saves to component state, no backend persistence
const saveSessionRewards = async (payoutSelected: 'wallet' | 'qrph' | 'cash') => {
  try {
    const res = await fetch("/api/deposit/complete", {
      method: "POST",
      body: JSON.stringify({
        memberId, amount, ecoPoints, co2Reduced, itemsSummary
      })
    });
    // Updates UI state only
    setReceiptData({ transactionId, date, materials, weight, reward, method, co2 });
  } catch (err) {
    // Fallback to LOCAL mock receipt - transaction is NOT logged!
    console.warn("Using smart local receipt fallback.");
    setReceiptData({
      transactionId: "TXN-" + Math.floor(100000 + Math.random() * 900000),  // FAKE ID!
      date, materials, weight, reward, method, co2
    });
  }
};
```

---

## 🔧 SECTION 2: HARDWARE & INTEGRATION BREAKDOWN

### 2.1 Serial Port Communication (MISSING)

**Current State:** ZERO implementation  
**Required For:**
- ESP32/Arduino board communication
- Real sensor data acquisition
- Motor/solenoid control

**Expected Files (MISSING):**
```
src/
  ├── hardware/
  │   ├── serialPort.ts           ❌ MISSING
  │   ├── sensorInterface.ts       ❌ MISSING
  │   ├── motorController.ts       ❌ MISSING
  │   └── calibration.ts           ❌ MISSING
```

**Production Implementation Required:**
```typescript
// Hardware Interface Layer (NOT IMPLEMENTED)
interface HardwareDriver {
  // Image acquisition
  captureFrame(): Promise<Buffer>;
  enableLaser(): Promise<void>;
  
  // Sensor readings
  readInductiveSensor(): Promise<boolean>;      // Metal detection
  readLoadCell(): Promise<number>;              // Weight in grams
  readTOFSensor(): Promise<number>;             // Distance in mm
  readTemperature(): Promise<number>;           // Temperature in °C
  
  // Bin status
  getBinLevel(type: 'plastic'|'aluminum'|'glass'): Promise<number>;  // Percentage
  
  // Motor control
  openSolenoidFlap(bin: string): Promise<void>;
  closeFlap(): Promise<void>;
  dispenseCoin(amount: number): Promise<void>;
  
  // Error recovery
  calibrateLoadCell(): Promise<boolean>;
  selfTest(): Promise<HardwareStatus>;
}

// Serial Protocol (NOT IMPLEMENTED)
// Format: [START_BYTE][COMMAND][LENGTH][DATA][CHECKSUM]
// Example: 0xAA 0x01 0x00 0xAB (request frame capture)
```

**Network Interface (MISSING):**
- No WebSocket connection for real-time hardware status
- No MQTT for IoT sensor integration
- No HTTP endpoints for hardware firmware updates

---

### 2.2 Missing Error Handling for Physical Failures

**File:** `src/App.tsx` (lines 383-469) - processNextItemSequential()

#### Unhandled Failure Scenarios:

| Scenario | Current Behavior | Should Be |
|----------|------------------|-----------|
| **Camera disconnects mid-scan** | Blindly continues with timeout | Retry 3x, show error modal, return to menu |
| **Load cell reads 0g consistently** | Accepts item as valid | Detect malfunction, show "Scale Error", pause deposit |
| **Inductive sensor stuck high** | Classifies ALL items as aluminum | Perform self-test, fail item, alert operator |
| **Motor jam during sorting** | Continues simulation, ignores jam | Timeout detection, jam alert, manual override UI |
| **Hopper empty mid-deposit** | No detection | Monitor bin levels, prevent insertions when full |
| **Network timeout on Gemini API** | Falls back to mock classification | Log failed classification, mark item as "unverified" |
| **User abandons item mid-chamber** | Waits 120s, auto-rejects | Detect motion sensor status, eject item, alert cleaning |
| **Coin dispenser jam** | Progress bar reaches 100% anyway | Timeout on dispense, customer service prompt |

**Code Gap Example:**
```typescript
// Lines 411-421 - NO ERROR HANDLING
if (canvasRef.current && videoRef.current && webcamActive) {
  try {
    canvasRef.current.width = 160;
    canvasRef.current.height = 120;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, 160, 120);
      item.imageBlobUrl = canvasRef.current.toDataURL('image/jpeg');
    }
  } catch (err) {
    console.warn("Could not copy frame", err);  // SILENTLY CONTINUES!
  }
}

// Should reject the item if image capture fails
if (!item.imageBlobUrl) {
  item.status = 'rejected';
  item.detectedMaterial = 'other';
  return;  // Skip this item, don't process
}
```

---

### 2.3 Camera Feed Handling

**File:** `src/App.tsx` (lines 289-309)

#### Issue: No camera fallback or error recovery
```typescript
const startWebcam = async () => {
  try {
    setWebcamActive(true);
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 400, height: 300 } 
    });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  } catch (err) {
    console.warn("System camera hardware block...");  // JUST WARNS!
    setWebcamActive(false);
    // Continues processing WITHOUT any visual feedback
  }
};
```

**Problems:**
- No retry mechanism
- Continues deposit verification without camera (mocked vision)
- User has no indication why camera failed
- No fallback to alternative image capture method

---

### 2.4 Webcam Stream Memory Leak

**File:** `src/App.tsx` (line 302-309)

#### Issue: Video tracks not properly stopped
```typescript
const stopWebcam = () => {
  if (videoRef.current && videoRef.current.srcObject) {
    const stream = videoRef.current.srcObject as MediaStream;
    stream.getTracks().forEach(track => track.stop());
    videoRef.current.srcObject = null;
  }
  setWebcamActive(false);
};
```

**Risk:** If called repeatedly without proper cleanup, media track state can become inconsistent. Should add:
```typescript
// Add timeout protection
let trackStopTimeout: NodeJS.Timeout | null = null;
const stopWebcam = () => {
  if (videoRef.current && videoRef.current.srcObject) {
    const stream = videoRef.current.srcObject as MediaStream;
    const tracks = stream.getTracks();
    
    if (tracks.length === 0) {
      console.warn("No active tracks to stop");
      return;
    }
    
    tracks.forEach(track => {
      track.stop();
      trackStopTimeout = setTimeout(() => {
        if (track.readyState !== 'ended') {
          console.error("Track failed to stop:", track.kind);
        }
      }, 2000);
    });
    
    videoRef.current.srcObject = null;
  }
  setWebcamActive(false);
};
```

---

## 💳 SECTION 3: PAYMENT GATEWAY & TRANSACTION FLOW

### 3.1 Xendit Integration - Critical Gaps

**File:** `server.ts` (lines 9-13, 160-228, 574-694)

#### Issue: Xendit API calls lack comprehensive error handling and retry logic

```typescript
// Lines 161-195 - FRAGILE DISBURSEMENT CALL
async function createXenditDisbursement(params: {
  externalId: string;
  amount: number;
  bankCode: string;
  accountNumber: string;
  accountHolderName: string;
  description: string;
}) {
  if (!XENDIT_SECRET_KEY) {
    throw new Error("Xendit API key not configured");
  }

  const response = await fetch(`${XENDIT_BASE_URL}/disbursements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${Buffer.from(XENDIT_SECRET_KEY + ":").toString("base64")}`
    },
    body: JSON.stringify({
      external_id: params.externalId,
      amount: params.amount,
      bank_code: params.bankCode,  // MISSING validation - no check for valid codes
      account_holder_name: params.accountHolderName,
      account_number: params.accountNumber,
      description: params.description
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Xendit disbursement failed");  // Generic error
  }

  return await response.json();
}

// MISSING:
// - Retry mechanism for transient failures
// - Timeout configuration
// - Network error handling
// - Rate limit detection
```

#### Issue: Missing webhook handler for async payout confirmation

```typescript
// Lines 746-779 - WEBHOOK HANDLER EXISTS BUT INCOMPLETE
app.post("/api/payout/webhook", (req, res) => {
  const webhookToken = req.headers['x-callback-token'];

  // Token verification is naive - should use HMAC signature
  if (XENDIT_WEBHOOK_TOKEN && webhookToken !== XENDIT_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: "Invalid webhook token" });
  }

  const event = req.body;
  console.log("Xendit webhook received:", event);

  if (event.external_id && event.status) {
    const payout = payoutsDb[event.external_id];
    if (payout) {
      if (event.status === "COMPLETED") {
        payout.status = 'COMPLETED';
        // Updates IN-MEMORY DB ONLY - not persisted!
      }
    }
  }

  res.json({ received: true });
});

// MISSING:
// - Webhook signature validation (HMAC-SHA256)
// - Idempotency handling (same webhook fired multiple times)
// - Database persistence
// - Error notification to user
// - Retry queue for failed webhook processing
```

---

### 3.2 GCash/Maya Account Validation (MISSING)

**File:** `server.ts` (lines 574-643)

#### Issue: No phone number format validation
```typescript
app.post("/api/payout/direct", async (req, res) => {
  const { memberId, amount, channel, accountNumber, accountName } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  if (!accountNumber || !accountName) {
    return res.status(400).json({ error: "Account number and name required" });
  }

  // NO VALIDATION OF:
  // - GCash/Maya phone format (should be +63XXXXXXXXXX or 09XXXXXXXXXX)
  // - Amount limits per platform
  // - Account holder name matching
  // - Duplicate submission within timeframe
});
```

**Production Requirements:**
```typescript
// Add validation layer
const validatePhoneNumber = (phone: string, channel: 'GCASH' | 'MAYA'): boolean => {
  const phoneRegex = /^(?:\+?63|0)9\d{9}$/;  // PH format
  if (!phoneRegex.test(phone)) return false;
  
  // Channel-specific limits
  if (channel === 'GCASH' && amount > 50000) return false;  // GCash limit
  if (channel === 'MAYA' && amount > 100000) return false;   // Maya limit
  
  return true;
};

const validateAccountHolder = (name: string): boolean => {
  // Check for profanity, special chars
  if (!/^[a-zA-Z\s'-]{3,100}$/.test(name)) return false;
  return true;
};

// Rate limiting
const recentPayout = payoutsDb[Object.keys(payoutsDb).find(id => 
  payoutsDb[id].accountNumber === accountNumber && 
  Date.now() - new Date(payoutsDb[id].createdAt).getTime() < 60000  // Within 1 min
)];
if (recentPayout) return res.status(429).json({ error: "Too many payouts in short time" });
```

---

### 3.3 Missing Payout Reconciliation

**File:** `server.ts` (lines 695-744)

#### Issue: No way to verify payout status after kiosk closes
```typescript
app.get("/api/payout/status/:externalId", async (req, res) => {
  const { externalId } = req.params;

  const payout = payoutsDb[externalId];
  if (!payout) {
    return res.status(404).json({ error: "Payout not found" });  // Returns 404 for lost data!
  }

  // If already completed or failed, return cached status
  if (payout.status !== 'PENDING') {
    return res.json({
      externalId,
      status: payout.status,
      failureReason: payout.failureReason
    });
  }

  // Poll Xendit for latest status
  try {
    const xenditStatus = await getXenditDisbursementStatus(externalId);
    // Updates in-memory cache
  } catch (error: any) {
    console.error("Status check error:", error);
    res.json({
      externalId,
      status: payout.status  // Returns stale status!
    });
  }
});

// MISSING:
// - Persistent transaction database to store payout history
// - Audit trail of all disbursements
// - Reconciliation reports
// - Failed payout retry logic
```

---

### 3.4 QR Code Generation (INCOMPLETE)

**File:** `src/App.tsx` (lines 566-577)

#### Issue: QRPh implementation is mocked
```typescript
const generateQRPhPayout = () => {
  const refNum = "REF-" + Math.floor(10000000 + Math.random() * 90000000);
  setPayoutReference(refNum);
  
  // MOCKED - not actual QRPh standard
  const rvmPayload = `QRPH_PAY_TO_RVM_REVISION_PROVIDER_${selectedBank}_REF_${refNum}_AMOUNT_PHP_${activeUser ? activeUser.walletBalance : totalPayout}`;
  setQrCodeDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(rvmPayload)}`);
  
  setCurrentState('QRPH_DISPLAY');
};
```

**Problems:**
1. Uses external QR code service (qrserver.com) - what if unavailable?
2. Payload format is NOT official QRPh standard
3. No actual integration with QRPh backend to validate QR code
4. No way to verify payment was actually made by scanning device

---

## 🔄 SECTION 4: STATE MACHINE & EDGE CASES

### 4.1 Missing Race Condition Handling

**File:** `src/App.tsx` (lines 161-193) - Inactivity timeout

#### Issue: No protection against simultaneous state changes
```typescript
useEffect(() => {
  if (currentState === 'IDLE') {
    return;
  }
  
  const interval = setInterval(() => {
    const isActivityHappening = 
      isProcessing || 
      currentState === 'VERIFYING_ITEMS' || 
      currentState === 'DISPENSING_CASH' || 
      printStatus === 'PRINTING' ||
      webcamActive;

    if (isActivityHappening) {
      setSecondsRemaining(120);
      return;
    }

    setSecondsRemaining((prev) => {
      if (prev <= 1) {
        setCurrentState('IDLE');        // RACE CONDITION HERE
        setActiveUser(null);            // Multiple state changes
        speakText("idleTouchToBegin");
      }
      return prev - 1;
    });
  }, 1000);

  return () => clearInterval(interval);
}, [currentState, isProcessing, printStatus, webcamActive]);
```

**Problem:** If user presses button at same time timeout fires, race condition occurs. Should use:

```typescript
const [isTimerActive, setIsTimerActive] = useState(false);

// Use mutex-like pattern
const resetInactivityTimer = useCallback(() => {
  if (isTimerActive) return;  // Prevent concurrent resets
  setSecondsRemaining(120);
}, [isTimerActive]);

// Atomic state transitions
const handleTimeout = useCallback(() => {
  setCurrentState(prev => prev === 'IDLE' ? prev : 'IDLE');  // Only transition if not already IDLE
  setActiveUser(null);
}, []);
```

---

### 4.2 User Walks Away Mid-Deposit

**File:** `src/App.tsx` (lines 312-469) - runVerificationProcess()

#### Issue: No detection or cleanup if user leaves during item verification
```typescript
const runVerificationProcess = async () => {
  // ... setup ...
  
  for (let i = 0; i < intendedPlastic; i++) {
    list.push({ /* item */ });
  }
  
  setTotalItemsCount(list.length);
  setCurrentState('VERIFYING_ITEMS');
  
  // STARTS PROCESSING - if user walks away, what happens?
  await processNextItemSequential(0, list);
};

const processNextItemSequential = async (idx: number, fullList: DepositedItem[]) => {
  if (idx >= fullList.length) {
    setCurrentState('DEPOSIT_COMPLETE_SUMMARY');
    return;
  }
  
  // 120-second inactivity timer will trigger DURING this loop
  // But processNextItemSequential continues executing async code
  // This causes state conflicts!
};
```

**Scenarios:**
1. Item 2 is being verified
2. Inactivity timer fires at 120 seconds, sets state to IDLE
3. processNextItemSequential still awaiting on item 2
4. User touches screen to start new deposit
5. **Race condition:** Two concurrent deposit processes

**Fix Required:**
```typescript
const [abortSignal, setAbortSignal] = useState<AbortController | null>(null);

const startDeposit = () => {
  const controller = new AbortController();
  setAbortSignal(controller);
  runVerificationProcess(controller.signal);
};

const runVerificationProcess = async (signal: AbortSignal) => {
  // ... setup ...
  await processNextItemSequential(0, list, signal);
};

const processNextItemSequential = async (idx: number, fullList: DepositedItem[], signal: AbortSignal) => {
  if (signal.aborted) {
    console.log("Deposit process aborted");
    // Clean up: eject item, return to menu
    return;
  }
  
  // ... process item ...
};

// Cleanup on timeout
useEffect(() => {
  if (currentState === 'IDLE' && abortSignal) {
    abortSignal.abort();
    setAbortSignal(null);
  }
}, [currentState]);
```

---

### 4.3 Multiple Items Inserted Simultaneously

**Current Behavior:** System expects ONE item at a time in chamber. If user inserts 2-3 items:

**Problem:** No multi-item detection logic
```typescript
// processNextItemSequential expects SEQUENTIAL items
// If 3 items drop in at once:
// - Load cell reads combined weight (35 + 45 + 280 = 360g)
// - Inductive sensor triggered multiple times
// - Camera captures all 3 items in frame
// - System processes as single unknown item → REJECTED
```

**Fix:** Implement item counting logic
```typescript
interface ItemCountResult {
  count: number;
  weights: number[];  // Individual weight measurements
  confidence: number;
}

async function countItemsInChamber(): Promise<ItemCountResult> {
  const readings: number[] = [];
  
  // Take 5 weight readings across 500ms
  for (let i = 0; i < 5; i++) {
    const weight = await hardwareInterface.getLoadCellReading();
    readings.push(weight);
    await sleep(100);
  }
  
  // Analyze variance - sudden weight change = new item
  const deltas = readings.slice(1).map((w, i) => w - readings[i]);
  const itemCount = deltas.filter(d => Math.abs(d) > 20).length + 1;
  
  if (itemCount > 1) {
    return {
      count: itemCount,
      weights: readings,
      confidence: 0.6
    };
  }
}
```

---

### 4.4 User Cancels After Item Is Swallowed

**File:** `src/App.tsx` (lines 1377-1509) - DEPOSIT_PLANNING state has "Cancel Plan" button

#### Issue: Once items enter hopper, they cannot be returned
```typescript
{/* START REVERSE VENDING DRIVER */}
<button 
  id="activate-rvm-button"
  onClick={async () => {
    await startWebcam();
    runVerificationProcess();
  }}
  className="... animate-pulse"
>
  <Cpu className="w-14 h-14 animate-spin-slow" />
  <span>{t('startRVM')}</span>
</button>

{/* CANCEL PLAN - but what happens if items are already in chamber? */}
<button 
  onClick={() => setCurrentState('MAIN_MENU')}
  className="... text-5xl">
  ❌
  <span>Cancel Plan</span>
</button>
```

**Problem:** No logic to:
1. Detect when items are physically in chamber
2. Eject items if user cancels
3. Refund user if items were partially processed

**Required Implementation:**
```typescript
const handleCancelDeposit = async () => {
  if (currentState === 'VERIFYING_ITEMS') {
    // Items are in chamber - MUST eject them
    await hardwareInterface.ejectItem();
    await waitForEjectionComplete(timeoutMs = 5000);
    
    // Reset session without crediting balance
    setProcessedItemsList([]);
    setCurrentState('MAIN_MENU');
  } else if (currentState === 'DEPOSIT_PLANNING') {
    // Safe to cancel - no items inserted yet
    setCurrentState('MAIN_MENU');
  }
};
```

---

### 4.5 Invalid E-Wallet Number Entry

**File:** `src/App.tsx` (lines 1903-1942) - QRPH_SELECT_PROVIDER

#### Issue: No phone number validation before payout attempt
```typescript
const confirmQRPhPayoutReceived = async () => {
  const deductAmount = activeUser ? activeUser.walletBalance : totalPayout;
  
  try {
    const res = await fetch("/api/redemption/withdraw", {
      method: "POST",
      body: JSON.stringify({
        memberId: activeUser?.memberId || null,
        payoutMethod: "QRPh",
        amount: deductAmount,
        provider: selectedBank  // NO VALIDATION of selectedBank value
      })
    });
    
    // ... process response ...
  } catch (e) {
    console.warn("Simulated local wallet balance decrement.");
    // SILENTLY FAILS - user sees nothing wrong
  }
};
```

**Problems:**
1. selectedBank is user-selected from ['GCash', 'Maya', 'BPI', 'BDO', 'UnionBank', 'Landbank']
2. No check if selected bank actually supports QRPh
3. No validation that QR code generated matches user's selected payment method
4. User can confirm payment without entering account number/phone

---

### 4.6 Session Timeout During Payout

**File:** `src/App.tsx` (lines 621-663) - Coin dispenser progress

#### Issue: Timeout doesn't prevent coin dispense completion
```typescript
useEffect(() => {
  if (currentState === 'DISPENSING_CASH') {
    const interval = setInterval(() => {
      setIntendedDispenserProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(async () => {
            // Deduct from wallet
            try {
              await fetch("/api/redemption/withdraw", { /* ... */ });
            } catch (e) {}
            
            // Set receipt
            setReceiptData(prevReceipt => ({ /* ... */ }));
            setCurrentState('FINAL_RECEIPT_CLIENT');
            speakText("receiptTitle");
          }, 1000);
          return 100;
        }
        return prev + 20;
      });
    }, 600);
    return () => clearInterval(interval);
  }
}, [currentState]);

// Meanwhile, inactivity timer could fire at any moment
// If timeout occurs during coin dispensing:
// - State changes to IDLE
// - activeUser is cleared
// - But coins may still be dispensing physically!
```

**Race Condition Scenario:**
1. User starts coin dispensing (progress = 0%)
2. At 50ms, inactivity timer fires → state = IDLE, activeUser = null
3. At 100ms, coin dispense continues → final wallet deduction happens with null memberId
4. Result: Coins dispensed but NO transaction recorded

---

### 4.7 Back Navigation Without State Cleanup

**File:** `src/App.tsx` (multiple states)

#### Issue: Going back doesn't stop active processes
```typescript
{/* In VERIFYING_ITEMS state */}
{currentState === 'VERIFYING_ITEMS' && (
  <div>
    {/* No back button - can't interrupt verification */}
    {/* But user could leave the screen and timeout triggers */}
  </div>
)}

{/* In QRPH_SELECT_PROVIDER state */}
{currentState === 'QRPH_SELECT_PROVIDER' && (
  <div>
    <button 
      onClick={() => {
        // Route back safely
        if (activeUser) setCurrentState('REDEEM_BALANCE_SCREEN');
        else setCurrentState('DEPOSIT_COMPLETE_SUMMARY');
      }}
    >
      {t('back')}
    </button>
  </div>
)}

// What if user was in the middle of:
// - QR code generation API call?
// - Xendit disbursement request?
// - Coin dispense motor running?
```

---

### 4.8 Missing Transaction Receipt Audit

**File:** `src/App.tsx` (lines 2049-2109) - FINAL_RECEIPT_CLIENT

#### Issue: Receipt data is stored in component state only
```typescript
{/* Receipt shown on screen but NOT persisted */}
<div id="receipt-thermal-paper" className="...">
  <div className="flex justify-between">
    <span>TRANSACTION ID:</span>
    <span className="font-black">{receiptData.transactionId || "TXN-901844"}</span>
  </div>
  {/* More receipt fields */}
</div>

{/* Print Receipt button - no actual printer integration */}
<button 
  onClick={triggerPrintReceipt}
  className="..."
>
  {/* Simulates printing with setTimeout */}
  {printStatus === 'PRINTING' ? 'Printing...' : 'Print Receipt'}
</button>
```

**Problems:**
1. No PDF generation
2. No thermal printer integration
3. No email receipt API
4. No SMS receipt service
5. Receipt lost if user navigates away
6. No transaction database backup

---

## 📋 PRIORITIZED ACTION LIST

### 🔴 CRITICAL BLOCKERS (Must Fix for Physical Kiosk Operation)

#### 1. **Hardware Communication Driver** [BLOCKER #1]
- **Impact:** Zero physical sensor readings
- **Effort:** 40-60 hours
- **Files to Create:** `src/hardware/`, `src/drivers/`
- **Implementation:**
  - Serial port communication (serialport npm)
  - Protocol parser for ESP32 firmware
  - Real-time sensor event listeners
  - Timeout & error recovery

#### 2. **Persistent Transaction Database** [BLOCKER #2]
- **Impact:** All payout & user data lost on restart
- **Effort:** 30-40 hours
- **Files to Modify:** `server.ts`
- **Implementation:**
  - PostgreSQL or MongoDB setup
  - User schema with validation
  - Transaction history persistence
  - Audit trail logging

#### 3. **Xendit Webhook & Reconciliation** [BLOCKER #3]
- **Impact:** Payouts not verified, money disappears
- **Effort:** 20-30 hours
- **Files to Modify:** `server.ts` (lines 746-779)
- **Implementation:**
  - HMAC signature verification
  - Idempotency handling
  - Retry queue for failed webhooks
  - Reconciliation reports

#### 4. **Item Rejection & Error Handling** [BLOCKER #4]
- **Impact:** Failed sensors don't stop deposit process
- **Effort:** 25-35 hours
- **Files to Modify:** `src/App.tsx` (lines 383-469)
- **Implementation:**
  - Timeout detection for each sensor stage
  - Jam detection logic
  - User error modal system
  - Automatic item eject on failure

#### 5. **Concurrent Deposit Prevention** [BLOCKER #5]
- **Impact:** Race conditions when user starts new deposit during timeout
- **Effort:** 15-20 hours
- **Files to Modify:** `src/App.tsx` (deposit flow)
- **Implementation:**
  - AbortController for deposit process
  - Mutex-like state lock mechanism
  - Atomic state transitions

#### 6. **GCash/Maya Phone Validation** [BLOCKER #6]
- **Impact:** Invalid account numbers accepted, payout fails
- **Effort:** 8-12 hours
- **Files to Modify:** `server.ts` (lines 574-643)
- **Implementation:**
  - Phone format regex validation
  - Channel-specific amount limits
  - Account holder name verification
  - Rate limiting per account

#### 7. **Computer Vision Fallback Logic** [BLOCKER #7]
- **Impact:** All items classified as plastic if Gemini fails
- **Effort:** 20-25 hours
- **Files to Modify:** `server.ts` (lines 474-572)
- **Implementation:**
  - Weight-based classification thresholds
  - Confidence score filtering
  - Cross-validation with inductive sensor
  - Rejection on low confidence

---

### 🟠 INTEGRATION GAPS (Hardware Communication & Dependencies)

#### 8. **Serial Port Communication** [INTEGRATION #1]
- Install `serialport` npm package
- Create `/src/hardware/serialPort.ts`
- Implement protocol parser
- Add baud rate & timeout configuration

#### 9. **ESP32 Firmware Protocol Specification** [INTEGRATION #2]
- Define binary protocol for sensor readings
- Create firmware documentation
- Implement handshake sequence
- Add self-test command

#### 10. **Load Cell Calibration** [INTEGRATION #3]
- Create calibration UI in settings
- Store tare weight in persistent config
- Implement per-session zero calibration
- Add weight range validation

#### 11. **Motor Control API** [INTEGRATION #4]
- Solenoid flap control (open/close)
- Motor speed PWM configuration
- Jam detection via current draw
- Timeout per operation

#### 12. **Camera Feed Processing** [INTEGRATION #5]
- Replace getUserMedia with hardware camera
- Add frame rate configuration
- Implement image buffering
- Add focus/exposure control

#### 13. **Bin Sensor Integration** [INTEGRATION #6]
- Implement ultrasonic distance sensors
- Capacity calculation per bin
- Full/near-full alerts
- Preventive item rejection when full

#### 14. **Temperature Monitoring** [INTEGRATION #7]
- DHT sensor reading
- Heat dissipation monitoring
- Thermal shutdown protection
- Environmental logging

#### 15. **Network Connectivity Detection** [INTEGRATION #8]
- Actual internet connectivity check
- Offline mode fallback
- Queue transactions for sync when online
- Connection status display

#### 16. **Printer Integration** [INTEGRATION #9]
- Thermal printer driver setup
- ESC/POS command formatting
- Print queue management
- Error recovery for printer jams

#### 17. **SMS Gateway Setup** [INTEGRATION #10]
- Twilio/SendGrid integration
- Receipt template formatting
- Delivery confirmation
- Failed send retry logic

#### 18. **Email Service** [INTEGRATION #11]
- PDF generation library (pdfkit)
- Email template HTML
- Attachment handling
- Bounce handling

#### 19. **QRPh Backend Integration** [INTEGRATION #12]
- Register with BSP for QRPh
- Validate QR payload format
- Implement payment verification endpoint
- Test with actual QRPh processors

---

### 🟡 UI/STATE EDGE CASES (Session Management & Error Modals)

#### 20. **User Walks Away Mid-Deposit** [EDGE CASE #1]
- Detect when user leaves during verification
- Implement item ejection logic
- Show "session abandoned" modal
- Reset state safely

#### 21. **Multiple Items Inserted Simultaneously** [EDGE CASE #2]
- Implement multi-item detection
- Weight variance analysis
- Force single-item processing
- Reject batch if multiple detected

#### 22. **Cancel After Item Swallowed** [EDGE CASE #3]
- Detect when items are in chamber
- Implement item ejection on cancel
- Prevent balance credit for partially processed items
- Operator alert if ejection fails

#### 23. **Session Timeout During Payout** [EDGE CASE #4]
- Pause inactivity timer during payout
- Lock state transitions during financial operations
- Show countdown timer to user
- Confirm before applying timeout

#### 24. **Back Navigation Without Cleanup** [EDGE CASE #5]
- Cancel active API calls when navigating
- Stop motor/dispenser operations
- Clear pending transactions
- Reset timers

#### 25. **Receipt Not Printed** [EDGE CASE #6]
- Implement receipt retry queue
- Show manual receipt number to customer
- Store receipt in cloud backup
- Allow SMS/email as alternative

#### 26. **Network Timeout on Payout** [EDGE CASE #7]
- Implement retry with exponential backoff
- Queue payout for later sync
- Show offline mode notice
- Provide transaction reference for manual follow-up

#### 27. **E-Wallet Number Correction** [EDGE CASE #8]
- Allow edit before confirmation
- Validate format real-time
- Show formatted preview
- Confirm 3 times before disbursement

---

## 🔧 CONCRETE CODE EXAMPLES & FIXES

### Fix #1: Add Abort Signal to Deposit Process

**File:** `src/App.tsx`

```typescript
// Add to state
const [depositAbortController, setDepositAbortController] = useState<AbortController | null>(null);

// Modify runVerificationProcess
const runVerificationProcess = async () => {
  const controller = new AbortController();
  setDepositAbortController(controller);
  
  const list: DepositedItem[] = [];
  // ... build list ...
  
  setTotalItemsCount(list.length);
  setProcessedItemsList([]);
  setCurrentItemIndex(0);
  setIsProcessing(true);
  setCurrentState('VERIFYING_ITEMS');

  try {
    await processNextItemSequential(0, list, controller.signal);
  } catch (err) {
    if (err instanceof Error && err.message === 'Deposit cancelled') {
      // Deposit was aborted - show cancellation UI
      setCurrentState('MAIN_MENU');
    } else {
      throw err;
    }
  }
};

// Modify processNextItemSequential
const processNextItemSequential = async (
  idx: number, 
  fullList: DepositedItem[],
  signal: AbortSignal
) => {
  if (signal.aborted) {
    throw new Error('Deposit cancelled');
  }
  
  if (idx >= fullList.length) {
    setVerificationStage('DONE');
    setIsProcessing(false);
    stopWebcam();
    setCurrentState('DEPOSIT_COMPLETE_SUMMARY');
    speakText("processingSummary");
    return;
  }

  // ... process item ...
  
  setTimeout(() => {
    processNextItemSequential(idx + 1, fullList, signal);
  }, 1500);
};

// Cleanup on timeout or state change
useEffect(() => {
  if (currentState === 'IDLE' && depositAbortController) {
    depositAbortController.abort();
    setDepositAbortController(null);
  }
}, [currentState, depositAbortController]);
```

---

### Fix #2: Add Phone Number Validation

**File:** `server.ts`

```typescript
// Add validation functions
const validatePhoneNumber = (phone: string, channel: 'GCASH' | 'MAYA'): { valid: boolean; error?: string } => {
  // Philippines phone formats: 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (cleanPhone.length !== 12) {
    return { valid: false, error: 'Phone number must be 11 digits' };
  }
  
  if (!cleanPhone.startsWith('63')) {
    return { valid: false, error: 'Must be Philippine phone number (+63...)' };
  }
  
  if (channel === 'GCASH' && cleanPhone[2] !== '9') {
    return { valid: false, error: 'GCash only accepts mobile numbers (09xx...)' };
  }
  
  return { valid: true };
};

const validateAccountHolder = (name: string): { valid: boolean; error?: string } => {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Account holder name is required' };
  }
  
  if (name.trim().length < 3 || name.trim().length > 100) {
    return { valid: false, error: 'Name must be 3-100 characters' };
  }
  
  // Only allow letters, spaces, hyphens, apostrophes
  if (!/^[a-zA-Z\s'-]+$/.test(name)) {
    return { valid: false, error: 'Name contains invalid characters' };
  }
  
  return { valid: true };
};

const validateDisbursementAmount = (
  amount: number,
  channel: 'GCASH' | 'MAYA'
): { valid: boolean; error?: string } => {
  const minAmount = 100;  // PHP 100 minimum
  const maxGCash = 50000;
  const maxMaya = 100000;
  
  if (amount < minAmount) {
    return { valid: false, error: `Minimum amount is ₱${minAmount}` };
  }
  
  if (channel === 'GCASH' && amount > maxGCash) {
    return { valid: false, error: `GCash maximum is ₱${maxGCash}` };
  }
  
  if (channel === 'MAYA' && amount > maxMaya) {
    return { valid: false, error: `Maya maximum is ₱${maxMaya}` };
  }
  
  return { valid: true };
};

// Update /api/payout/direct endpoint
app.post("/api/payout/direct", async (req, res) => {
  const { memberId, amount, channel, accountNumber, accountName } = req.body;

  // Validate inputs
  const amountValidation = validateDisbursementAmount(amount, channel);
  if (!amountValidation.valid) {
    return res.status(400).json({ error: amountValidation.error });
  }

  const phoneValidation = validatePhoneNumber(accountNumber, channel);
  if (!phoneValidation.valid) {
    return res.status(400).json({ error: phoneValidation.error });
  }

  const nameValidation = validateAccountHolder(accountName);
  if (!nameValidation.valid) {
    return res.status(400).json({ error: nameValidation.error });
  }

  // Check for duplicate requests within 60 seconds
  const recentPayout = Object.values(payoutsDb).find(p =>
    p.accountNumber === accountNumber &&
    p.status === 'PENDING' &&
    Date.now() - new Date(p.createdAt).getTime() < 60000
  );
  
  if (recentPayout) {
    return res.status(429).json({ 
      error: 'A payout to this account is already in progress. Please wait.' 
    });
  }

  // Continue with actual disbursement...
});
```

---

### Fix #3: Add Retry Logic for Gemini API

**File:** `server.ts`

```typescript
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function callGeminiVisionWithRetry(
  base64Data: string,
  maxRetries: number = MAX_RETRIES
): Promise<any> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await Promise.race([
        ai!.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            {
              inlineData: {
                data: base64Data,
                mimeType: "image/jpeg"
              }
            },
            { 
              text: `Analyze this recyclable container image...` 
            }
          ],
          config: { responseMimeType: "application/json" }
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API timeout')), 10000)
        )
      ]);

      const responseText = response.text || "";
      const parsed = JSON.parse(responseText.trim());
      
      if (parsed.confidence < 0.75) {
        throw new Error(`Low confidence: ${parsed.confidence}`);
      }
      
      return parsed;
    } catch (err: any) {
      console.warn(`Attempt ${attempt + 1} failed:`, err.message);
      
      if (attempt < maxRetries - 1) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw new Error(`Failed after ${maxRetries} retries: ${err.message}`);
      }
    }
  }
}

app.post("/api/detect-waste", async (req, res) => {
  const { imageBase64, hardwareInductive, hardwareWeight } = req.body;

  let materialType = "plastic";
  let itemName = "PET Beverage Bottle";
  let confidence = 0.95;

  if (ai && imageBase64) {
    try {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      
      const detection = await callGeminiVisionWithRetry(base64Data);
      materialType = detection.detectedMaterial;
      itemName = detection.itemName;
      confidence = detection.confidence;
      
      // Validate against hardware hints
      if (hardwareInductive && materialType !== 'aluminum') {
        console.warn('Inductive sensor contradiction: detected', materialType);
        // Mark for manual review
      }
    } catch (err: any) {
      console.error("Vision detection failed:", err.message);
      // Return rejection instead of fallback
      return res.status(503).json({
        error: "Classification service unavailable",
        fallback: true,
        detectedMaterial: 'other',
        status: 'rejected'
      });
    }
  }

  res.json({
    success: true,
    detectedMaterial: materialType,
    confidence: confidence,
    itemName: itemName,
    payoutPhilippinePesos: materialType === 'plastic' ? 1.0 : materialType === 'aluminum' ? 2.5 : 1.5,
    ecoPointsEarned: materialType === 'plastic' ? 10 : materialType === 'aluminum' ? 25 : 15,
    co2ReductionKg: materialType === 'plastic' ? 0.04 : materialType === 'aluminum' ? 0.09 : 0.06
  });
});
```

---

### Fix #4: Add Hardware Error Modal

**File:** `src/App.tsx`

```typescript
const [hardwareError, setHardwareError] = useState<{
  title: string;
  message: string;
  recoveryOptions: string[];
} | null>(null);

const handleSensorFailure = (stage: string, error: Error) => {
  stopWebcam();
  setIsProcessing(false);
  
  setHardwareError({
    title: `${stage} Sensor Failure`,
    message: `The ${stage} sensor failed to respond. ${error.message}`,
    recoveryOptions: [
      'Retry',
      'Skip Item',
      'End Session'
    ]
  });
};

// Add error modal UI
{hardwareError && (
  <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
    <div className={`${cCard} p-8 rounded-3xl max-w-md space-y-6 border shadow-2xl`}>
      <div className="flex items-center gap-4 text-red-500">
        <ShieldAlert className="w-12 h-12" />
        <h3 className="text-2xl font-black">{hardwareError.title}</h3>
      </div>
      
      <p className={`text-base ${cTextNormal}`}>{hardwareError.message}</p>
      
      <div className="space-y-3">
        {hardwareError.recoveryOptions.map(option => (
          <button
            key={option}
            onClick={() => {
              if (option === 'Retry') {
                setHardwareError(null);
                // Retry verification
              } else if (option === 'Skip Item') {
                setHardwareError(null);
                // Mark item as rejected, move to next
              } else {
                setHardwareError(null);
                setCurrentState('MAIN_MENU');
              }
            }}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  </div>
)}
```

---

## 📞 ENVIRONMENT VARIABLES REQUIRED FOR PRODUCTION

Create `.env` with these additions:

```bash
# GEMINI AI Vision
GEMINI_API_KEY=your_actual_key_here

# Xendit E-Wallet Payouts
XENDIT_SECRET_KEY=xnd_live_YOUR_LIVE_KEY
XENDIT_WEBHOOK_TOKEN=your_secure_random_token

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/revision_rvm
DATABASE_POOL_SIZE=20

# Hardware Serial Port
HARDWARE_PORT=/dev/ttyUSB0  # Linux: /dev/ttyUSB0, macOS: /dev/tty.usbserial*, Windows: COM3
HARDWARE_BAUD_RATE=115200
HARDWARE_TIMEOUT_MS=5000

# SMS Gateway (Twilio)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...

# Email Service (SendGrid)
SENDGRID_API_KEY=SG...

# Printer
PRINTER_PATH=/dev/usb/lp0
PRINTER_ENCODING=utf8

# QRPh Integration
QRPH_API_KEY=your_qrph_key
QRPH_MERCHANT_ID=your_merchant_id

# Node env
NODE_ENV=production
PORT=3000
```

---

## 🎯 DEPLOYMENT CHECKLIST

- [ ] All 7 critical blockers resolved
- [ ] 12 integration gaps completed
- [ ] 8 edge cases handled
- [ ] Database schema finalized & tested
- [ ] Hardware firmware uploaded to ESP32
- [ ] Serial port communication tested
- [ ] Xendit sandbox testing completed
- [ ] QRPh integration verified
- [ ] SMS/Email templates tested
- [ ] Thermal printer integration verified
- [ ] Error modals designed & implemented
- [ ] Offline mode fallback implemented
- [ ] Transaction audit trails implemented
- [ ] Load testing completed
- [ ] Security review completed (OWASP Top 10)
- [ ] PCI compliance for payment data
- [ ] Accessibility testing (WCAG 2.1)

---

## 📖 NEXT STEPS FOR DEVELOPER

**Priority Order:**
1. Start with BLOCKER #2 (Database) - enables all other work
2. Implement BLOCKER #1 (Hardware Driver) in parallel
3. Complete BLOCKERs #3-7 sequentially
4. Integrate INTEGRATION GAPs 1-5 (hardware communication)
5. Add error modals and edge case handling
6. Performance & security testing

**Estimated Timeline:**
- Week 1-2: Database + Hardware drivers
- Week 3: Core hardware integration
- Week 4: Payment processing + Xendit
- Week 5: Edge case handling + error recovery
- Week 6: Testing + deployment prep

---

**Report Generated:** 2026-08-27  
**Total Issues Found:** 27 (7 Critical + 12 Integration + 8 Edge Cases)  
**Estimated Fix Time:** 250-350 hours (6-8 weeks with full team)
