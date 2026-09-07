import { SerialPort } from "serialport";

const path = "/dev/serial0";

const port = new SerialPort({
  path,
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
});

console.log("Opened", path);

setTimeout(() => {
  console.log("Writing HELLO...");
  port.write("HELLO FROM NODE\n", (err) => {
    if (err) {
      console.error("Write failed:", err.message);
      process.exit(1);
    }
    console.log("Write success, closing in 2s...");
    setTimeout(() => {
      port.close(() => process.exit(0));
    }, 2000);
  });
}, 1000);
