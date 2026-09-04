import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const PORT_PATH = "/dev/serial0";
const BAUD_RATE = 9600;

let port: SerialPort | null = null;
let parser: ReadlineParser | null = null;

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

function initPrinter(): SerialPort | null {
  if (port && port.isOpen) {
    return port;
  }

  try {
    port = new SerialPort({
      path: PORT_PATH,
      baudRate: BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      autoOpen: false,
    });

    port.open((err) => {
      if (err) {
        console.warn("❌ Failed to open thermal printer:", err.message);
      } else {
        console.log("🖨️  Thermal printer connected on /dev/serial0");
      }
    });

    parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));
    return port;
  } catch (err: any) {
    console.warn("❌ Thermal printer init failed:", err.message);
    return null;
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

  chunks.push(GS, Buffer.from([0x56, 0x00])); // Full cut
  chunks.push(LF);

  return Buffer.concat(chunks);
}

export async function printReceipt(receipt: ReceiptData): Promise<boolean> {
  const printer = initPrinter();
  if (!printer || !printer.isOpen) {
    console.warn("🖨️  Printer not available");
    return false;
  }

  try {
    const data = buildEscPos(receipt);
    printer.write(data);
    return true;
  } catch (err: any) {
    console.warn("❌ Print failed:", err.message);
    return false;
  }
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
