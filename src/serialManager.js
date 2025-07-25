let port = null;
let reader = null;

export function setSerialPort(newPort) {
  port = newPort;
}
export function getSerialPort() {
  return port;
}
export function setSerialReader(newReader) {
  reader = newReader;
}
export function getSerialReader() {
  return reader;
}
export async function disconnectSerial() {
  try {
    if (reader) {
      await reader.cancel();
      reader = null;
    }
    if (port) {
      await port.close();
      port = null;
    }
  } catch (e) {
    // ignore errors
  }
} 