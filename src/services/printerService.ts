import { execSync } from "child_process";
import { writeFileSync } from "fs";

const PORT_PATH = "/dev/ttyAMA0";
const BAUD_RATE = 9600;

export interface ReceiptData {
  items: Array<{ name: string; material: string; weightGrams: number; points: number }>;
  totalPoints: number;
  user?: { name: string; email?: string; phone?: string };
  timestamp: string;
  transactionId: string;
}

function writeRaw(data: Buffer): boolean {
  try {
    console.log("========================================");
    console.log("🖨️  PRINTER WRITE STARTED");
    console.log("🖨️  Port:", PORT_PATH);
    console.log("🖨️  Bytes:", data.length);
    console.log("🖨️  First 50 bytes hex:", data.slice(0, 50).toString("hex"));
    console.log("========================================");

    try {
      execSync(`stty -F ${PORT_PATH} ${BAUD_RATE} cs8 -cstopb -parenck -ixon -ixoff -crtscts raw -echo 2>/dev/null || true`, { stdio: "ignore" });
    } catch {
      // ignore stty errors
    }

    const tmpFile = `/tmp/printer-${Date.now()}.bin`;
    writeFileSync(tmpFile, data);
    console.log("🖨️  Temp file written, catting to", PORT_PATH);

    execSync(`cat ${tmpFile} > ${PORT_PATH}`, { stdio: "ignore" });

    try {
      execSync(`rm -f ${tmpFile}`, { stdio: "ignore" });
    } catch {
      // ignore cleanup errors
    }

    console.log("🖨️  PRINTER WRITE COMPLETED");
    return true;
  } catch (err: any) {
    console.warn("❌ PRINTER WRITE FAILED:", err.message);
    return false;
  }
}

function buildEscPos(receipt: ReceiptData): Buffer {
  const ESC = Buffer.from([0x1b]);
  const GS = Buffer.from([0x1d]);
  const LF = Buffer.from([0x0a]);

  const chunks: Buffer[] = [];

  chunks.push(ESC, Buffer.from([0x40])); // Initialize
  chunks.push(ESC, Buffer.from([0x61, 0x01])); // Center align

  chunks.push(Buffer.from("REVISION RECYCLING KIOSK\n", "ascii"));
  chunks.push(Buffer.from("IoT Autonomous Sorting System v5\n", "ascii"));
  chunks.push(Buffer.from("Barangay Bel-Air, Makati\n", "ascii"));
  chunks.push(Buffer.from("Machine ID: HW-P5-REVISION01\n\n", "ascii"));

  chunks.push(Buffer.from("================================\n", "ascii"));

  chunks.push(ESC, Buffer.from([0x61, 0x00])); // Left align
  chunks.push(Buffer.from(`TRANSACTION ID: ${receipt.transactionId}\n`, "ascii"));
  chunks.push(Buffer.from(`DATE & TIME: ${new Date(receipt.timestamp).toLocaleString()}\n`, "ascii"));
  chunks.push(Buffer.from(`DISBURSE METHOD: ${receipt.user?.name ? 'Eco-Wallet' : 'Cash Dispenser'}\n`, "ascii"));

  chunks.push(Buffer.from("--------------------------------\n", "ascii"));

  for (const item of receipt.items) {
    chunks.push(Buffer.from(`${item.name} x1\n`, "ascii"));
  }

  chunks.push(Buffer.from("--------------------------------\n", "ascii"));
  chunks.push(Buffer.from(`MATERIALS DEPOSITED: ${receipt.items.length} items\n`, "ascii"));
  chunks.push(Buffer.from(`NET MASS: ${(receipt.items.reduce((sum, i) => sum + i.weightGrams, 0) / 1000).toFixed(2)} Kg\n`, "ascii"));
  chunks.push(Buffer.from(`ECO SAVED CO2 OFFSET: ${(receipt.items.reduce((sum, i) => sum + (i.material === 'plastic' ? 0.04 : i.material === 'aluminum' ? 0.09 : 0.02), 0)).toFixed(3)} Kg\n`, "ascii"));

  chunks.push(Buffer.from("--------------------------------\n", "ascii"));
  chunks.push(ESC, Buffer.from([0x61, 0x01])); // Center align
  chunks.push(Buffer.from(`NET RETURN VAL: P${receipt.totalPoints.toFixed(2)}\n`, "ascii"));

  chunks.push(Buffer.from("================================\n\n", "ascii"));
  chunks.push(Buffer.from("Thank you for recycling!\n", "ascii"));
  chunks.push(Buffer.from("Keep reducing plastic consumption!\n\n", "ascii"));

  chunks.push(ESC, Buffer.from([0x64, 0x05])); // Feed 5 lines
  chunks.push(GS, Buffer.from([0x56, 0x00])); // Full cut
  chunks.push(LF);
  chunks.push(LF);
  chunks.push(LF);

  return Buffer.concat(chunks);
}

export function printReceipt(receipt: ReceiptData): boolean {
  const data = buildEscPos(receipt);
  const ok = writeRaw(data);
  if (ok) {
    console.log(`🖨️  Receipt printed: ${receipt.transactionId}`);
  }
  return ok;
}

export function testPrinterCommands(): boolean {
  console.log("🧪 Testing QR204 printer via ttyAMA0...");

  const tests: Array<{ name: string; data: Buffer }> = [
    { name: "Plain text", data: Buffer.from("HELLO WORLD\n") },
    { name: "ESC init + text", data: Buffer.concat([Buffer.from([0x1b, 0x40]), Buffer.from("Test\n")]) },
    { name: "Full receipt", data: buildEscPos({
      items: [{ name: "PET Bottle", material: "plastic", weightGrams: 22, points: 10 }],
      totalPoints: 10,
      timestamp: new Date().toISOString(),
      transactionId: "TEST",
    }) },
  ];

  for (const test of tests) {
    const ok = writeRaw(test.data);
    if (ok) {
      console.log(`  ✅ Sent: ${test.name}`);
    } else {
      console.warn(`  ❌ ${test.name} failed`);
    }
    try {
      execSync("sleep 2", { stdio: "ignore" });
    } catch {
      // ignore sleep errors
    }
  }

  return true;
}
