import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const PORT_PATH = "/dev/ttyAMA0";
const BAUD_RATE = 9600;

export interface ReceiptData {
  items: Array<{
    name: string;
    material: string;
    weightGrams: number;
    points: number;
  }>;
  totalPoints: number;
  user?: {
    name: string;
    email?: string;
    phone?: string;
  };
  timestamp: string;
  transactionId: string;
}

async function ensureBaudRate(): Promise<void> {
  try {
    await execAsync(`stty -F ${PORT_PATH} ${BAUD_RATE} cs8 -cstopb -parenck -ixon -ixoff -crtscts raw -echo 2>/dev/null || true`);
  } catch {
    // ignore stty errors
  }
}

async function writeToPrinter(data: Buffer): Promise<boolean> {
  try {
    await ensureBaudRate();
    const tmpFile = `/tmp/receipt-${Date.now()}.bin`;
    const { writeFile } = await import("fs");
    await writeFile(tmpFile, data);
    await execAsync(`cat ${tmpFile} > ${PORT_PATH}`);
    await execAsync(`rm -f ${tmpFile}`);
    return true;
  } catch (err: any) {
    console.warn("❌ Printer write failed:", err.message);
    return false;
  }
}

function buildEscPos(receipt: ReceiptData): Buffer {
  const ESC = Buffer.from([0x1b]);
  const GS = Buffer.from([0x1d]);
  const LF = Buffer.from([0x0a]);

  const chunks: Buffer[] = [];

  chunks.push(ESC, Buffer.from([0x40])); // Initialize printer
  chunks.push(ESC, Buffer.from([0x61, 0x01])); // Center align

  chunks.push(Buffer.from("================================\n", "ascii"));
  chunks.push(Buffer.from("       ReVision RVM Kiosk\n", "ascii"));
  chunks.push(Buffer.from("================================\n\n", "ascii"));

  if (receipt.user?.name) {
    chunks.push(Buffer.from(`User: ${receipt.user.name}\n`, "ascii"));
  }

  chunks.push(Buffer.from(`Date: ${new Date(receipt.timestamp).toLocaleString()}\n`, "ascii"));
  chunks.push(Buffer.from(`Txn ID: ${receipt.transactionId}\n\n`, "ascii"));

  chunks.push(Buffer.from("--------------------------------\n", "ascii"));
  chunks.push(Buffer.from("Item               Qty  Points\n", "ascii"));
  chunks.push(Buffer.from("--------------------------------\n", "ascii"));

  for (const item of receipt.items) {
    const name = item.name.length > 18 ? item.name.slice(0, 18) : item.name.padEnd(18, " ");
    const qty = "1";
    const pts = String(item.points).padStart(6, " ");
    chunks.push(Buffer.from(`${name}${qty}  ${pts}\n`, "ascii"));
  }

  chunks.push(Buffer.from("--------------------------------\n", "ascii"));
  const total = `TOTAL POINTS`.padEnd(18, " ") + String(receipt.totalPoints).padStart(6, " ");
  chunks.push(Buffer.from(`${total}\n\n`, "ascii"));

  chunks.push(ESC, Buffer.from([0x61, 0x01])); // Center align
  chunks.push(Buffer.from("Thank you for recycling!\n", "ascii"));
  chunks.push(Buffer.from("Please keep this receipt.\n\n", "ascii"));

  chunks.push(ESC, Buffer.from([0x64, 0x05])); // Feed 5 lines
  chunks.push(GS, Buffer.from([0x56, 0x00])); // Full cut
  chunks.push(LF);
  chunks.push(LF);
  chunks.push(LF);

  return Buffer.concat(chunks);
}

export async function printReceipt(receipt: ReceiptData): Promise<boolean> {
  const data = buildEscPos(receipt);
  const ok = await writeToPrinter(data);
  if (ok) {
    console.log(`🖨️  Receipt printed: ${receipt.transactionId}`);
  }
  return ok;
}

export async function testPrinterCommands(): Promise<boolean> {
  console.log("🧪 Testing QR204 printer via shell echo...");

  const tests: Array<{ name: string; data: Buffer }> = [
    { name: "Plain text", data: Buffer.from("HELLO WORLD\n") },
    { name: "ESC init + text", data: Buffer.concat([Buffer.from([0x1b, 0x40]), Buffer.from("Test\n")]) },
    { name: "Full receipt", data: buildEscPos({
      items: [{name: "PET Bottle", material: "plastic", weightGrams: 22, points: 10}],
      totalPoints: 10,
      timestamp: new Date().toISOString(),
      transactionId: "TEST",
    }) },
  ];

  for (const test of tests) {
    const ok = await writeToPrinter(test.data);
    if (ok) {
      console.log(`  ✅ Sent: ${test.name}`);
    } else {
      console.warn(`  ❌ ${test.name} failed`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  return true;
}

export function closePrinter(): void {
  // no-op for shell-based writer
}
