import { SerialPort } from "serialport";

const PORT_PATH = process.env.PRINTER_PORT || "/dev/serial0";
const BAUD_RATE = 9600;

async function testRawWrite() {
  console.log(`Opening ${PORT_PATH} at ${BAUD_RATE} baud...`);

  const port = new SerialPort({
    path: PORT_PATH,
    baudRate: BAUD_RATE,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    autoOpen: false,
  });

  port.open((err) => {
    if (err) {
      console.error("❌ Failed to open:", err.message);
      process.exit(1);
    }

    console.log("✅ Port opened. Sending test...");

    // Test 1: Plain text only
    setTimeout(() => {
      port.write("HELLO WORLD\n", (err) => {
        if (err) console.error("Write failed:", err);
        else console.log("📤 Sent: HELLO WORLD");
      });
    }, 500);

    // Test 2: With ESC/POS init
    setTimeout(() => {
      port.write(Buffer.from([0x1b, 0x40, 0x1b, 0x61, 0x01, 0x0a]), (err) => {
        if (err) console.error("Write failed:", err);
        else console.log("📤 Sent: ESC @ + ESC a 1 + LF");
      });
    }, 1500);

    // Test 3: Full test receipt
    setTimeout(() => {
      const ESC = 0x1b;
      const GS = 0x1d;
      const LF = 0x0a;
      const CR = 0x0d;

      const data = Buffer.concat([
        Buffer.from([ESC, 0x40]), // Init
        Buffer.from([ESC, 0x61, 0x01]), // Center
        Buffer.from("=== TEST RECEIPT ===\n", "ascii"),
        Buffer.from([ESC, 0x61, 0x00]), // Left align
        Buffer.from("Item  Qty  Price\n", "ascii"),
        Buffer.from("----  ---  -----\n", "ascii"),
        Buffer.from("Cola  1    ₱20\n", "ascii"),
        Buffer.from("Chips 1    ₱15\n", "ascii"),
        Buffer.from([ESC, 0x61, 0x01]), // Center
        Buffer.from("TOTAL: ₱35\n", "ascii"),
        Buffer.from("\nThank you!\n", "ascii"),
        Buffer.from([GS, 0x56, 0x00]), // Cut
        Buffer.from([LF, LF]),
      ]);

      port.write(data, (err) => {
        if (err) console.error("Write failed:", err);
        else console.log("📤 Sent: Full test receipt");
      });
    }, 2500);

    // Close after 5 seconds
    setTimeout(() => {
      port.close(() => {
        console.log("✅ Test complete. Port closed.");
        process.exit(0);
      });
    }, 5000);
  });
}

testRawWrite().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
