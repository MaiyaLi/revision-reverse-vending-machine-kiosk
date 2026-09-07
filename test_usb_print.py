import os
devices = ["/dev/usb/lp0", "/dev/usb/lp1", "/dev/lp0"]
printer = None
for dev in devices:
    if os.path.exists(dev):
        printer = dev
        print("Found printer at", dev)
        break
if not printer:
    print("No printer device found")
    exit(1)
with open(printer, "wb") as f:
    print("Sending HELLO...")
    f.write(b"HELLO WORLD\n")
    f.flush()
    print("Done!")
