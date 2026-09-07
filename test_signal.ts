import { SerialPort } from "serialport";

const PORT_PATH = "/dev/serial0";
const BAUD_RATE = 9600;

console.log("Opening", PORT_PATH, "at", BAUD_RATE, "baud...");

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

  console.log("✅ Port opened successfully!");
  console.log("Sending plain text in 1 second...");

  setTimeout(() => {
    const testText = "HELLO WORLD\n";
    console.log("Writing:", JSON.stringify(testText));
    
    port.write(testText, (err) => {
      if (err) {
        console.error("❌ Write failed:", err.message);
      } else {
        console.log("✅ Write successful!");
      }
      
      setTimeout(() => {
        port.close(() => {
          console.log("Port closed. Did the printer print?");
          process.exit(0);
        });
      }, 2000);
    });
  }, 1000);
});

port.on("error", (err) => {
  console.error("❌ Port error:", err.message);
});
