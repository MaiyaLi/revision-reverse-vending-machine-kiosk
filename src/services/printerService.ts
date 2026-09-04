import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const BAUD_RATE = 9600;

let port: SerialPort | null = null;
let parser: ReadlineParser | null = null;

async function findUsbPrinter(): Promise<string | null> {
  const ports = await SerialPort.list();
  const usbPrinter = ports.find(p => p.path?.includes("usb") || p.path?.includes("lp") || p.manufacturer?.includes("gxmc") || p.vendorId === "28e9");
  return usbPrinter?.path || null;
}

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

function waitForPort(path: string, baudRate?: number): Promise<SerialPort> {
  return new Promise((resolve, reject) => {
    const options: any = { autoOpen: false };
    if (baudRate) {
      options.baudRate = baudRate;
      options.dataBits = 8;
      options.stopBits = 1;
      options.parity = "none";
    }

    const testPort = new SerialPort({
      path,
      ...options,
    });

    testPort.open((err) => {
      if (err) {
        reject(new Error(`Failed to open ${path}${baudRate ? ` @ ${baudRate} baud` : ""}: ${err.message} (code: ${err.code})`));
      } else {
        console.log(`🖨️  Printer connected on ${path}${baudRate ? ` @ ${baudRate} baud` : ""}`);
        parser = testPort.pipe(new ReadlineParser({ delimiter: "\n" }));
        setTimeout(() => resolve(testPort), 300);
      }
    });
  });
}

async function initPrinter(): Promise<SerialPort | null> {
  if (port && port.isOpen) {
    return port;
  }

  // Try auto-detected USB printer first
  try {
    const usbPath = await findUsbPrinter();
    if (usbPath) {
      port = await waitForPort(usbPath);
      return port;
    }
  } catch (err: any) {
    console.warn(`❌ USB auto-detect: ${err.message}`);
  }

  // Fall back to known USB paths
  const usbPaths = ["/dev/usb/lp0", "/dev/usb/lp1", "/dev/lp0"];
  for (const path of usbPaths) {
    try {
      port = await waitForPort(path);
      return port;
    } catch (err: any) {
      console.warn(`❌ USB ${path}: ${err.message}`);
    }
  }

  // Fall back to serial
  const serialPaths = ["/dev/serial0", "/dev/ttyAMA0"];
  for (const path of serialPaths) {
    try {
      port = await waitForPort(path, BAUD_RATE);
      return port;
    } catch (err: any) {
      console.warn(`❌ Serial ${path}: ${err.message}`);
    }
  }

  return null;
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
  if (receipt.user?.email) {
    chunks.push(Buffer.from(`Email: ${receipt.user.email}\n`, "ascii"));
  }
  if (receipt.user?.phone) {
    chunks.push(Buffer.from(`Phone: ${receipt.user.phone}\n`, "ascii"));
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
  const printer = await initPrinter();
  if (!printer || !printer.isOpen) {
    console.warn("🖨️  Printer not available");
    return false;
  }

  try {
    const data = buildEscPos(receipt);
    await new Promise((resolve, reject) => {
      if (!printer || !printer.isOpen) {
        return reject(new Error("Printer not open"));
      }
      printer.write(data, (err) => {
        if (err) return reject(err);
        printer.flush?.();
        resolve(true);
      });
    });
    await new Promise(r => setTimeout(r, 500));
    return true;
  } catch (err: any) {
    console.warn("❌ Print failed:", err.message);
    return false;
  }
}

export async function testPrinterCommands(): Promise<boolean> {
  const printer = await initPrinter();
  if (!printer || !printer.isOpen) {
    console.warn("🖨️  Printer not available for command test");
    return false;
  }

  console.log("🧪 Testing QR204 raw printer commands...");

  const tests = [
    { name: "Plain text only", data: Buffer.from("HELLO WORLD\n") },
    { name: "ESC init + text", data: Buffer.concat([Buffer.from([0x1b, 0x40]), Buffer.from("Test\n")]) },
    { name: "ESC init + feed + text + cut", data: Buffer.concat([
      Buffer.from([0x1b, 0x40]),
      Buffer.from([0x1b, 0x64, 0x03]),
      Buffer.from("Line 1\nLine 2\nLine 3\n"),
      Buffer.from([0x1b, 0x64, 0x05]),
      Buffer.from([0x1d, 0x56, 0x00]),
    ])},
    { name: "Full receipt with extra feed", data: buildEscPos({
      items: [{name: "Test", material: "plastic", weightGrams: 100, points: 10}],
      totalPoints: 10,
      timestamp: new Date().toISOString(),
      transactionId: "TEST",
    }) },
  ];

  for (const test of tests) {
    try {
      await new Promise((resolve, reject) => {
        printer.write(test.data, (err) => {
          if (err) return reject(err);
          printer.flush?.();
          resolve(true);
        });
      });
      console.log(`  ✅ Sent: ${test.name}`);
      await new Promise(r => setTimeout(r, 2000));
    } catch (err: any) {
      console.warn(`  ❌ ${test.name} failed:`, err.message);
    }
  }

  return true;
}

export function closePrinter(): void {
  if (parser) {
    parser.destroy();
    parser = null;
  }
  if (port && port.isOpen) {
    port.close((err) => {
      if (err) console.warn("❌ Failed to close printer:", err.message);
    });
    port = null;
  }
}
