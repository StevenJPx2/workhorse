// Runs inside the VM. Tries every route out; prints one JSON line per attempt.
// Usage: node egress.mjs <brokerPort> <decoyPort>
import dgram from "node:dgram";
import dns from "node:dns/promises";
import net from "node:net";

const [brokerPort, decoyPort] = process.argv.slice(2).map(Number);
const TIMEOUT_MS = 5_000;

const withTimeout = (promise) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS).unref())]);

async function attempt(name, run) {
  try {
    const detail = await withTimeout(run());
    console.log(JSON.stringify({ name, reached: true, detail }));
  } catch (error) {
    console.log(JSON.stringify({ name, reached: false, detail: String(error?.code ?? error?.message ?? error) }));
  }
}

const tcp = (host, port) =>
  new Promise((resolve, reject) => {
    const socket = net.connect({ host, port }, () => {
      socket.destroy();
      resolve("connected");
    });
    socket.on("error", reject);
  });

await attempt("broker http", async () => (await fetch(`http://127.0.0.1:${brokerPort}/v1/models`)).status);
await attempt("decoy host port, http", async () => (await fetch(`http://127.0.0.1:${decoyPort}/`)).status);
await attempt("decoy host port, tcp", () => tcp("127.0.0.1", decoyPort));
await attempt("broker via localhost name", async () => (await fetch(`http://localhost:${brokerPort}/v1/models`)).status);
await attempt("broker via ::1", async () => (await fetch(`http://[::1]:${brokerPort}/v1/models`)).status);
await attempt("broker via 0.0.0.0", () => tcp("0.0.0.0", brokerPort));
await attempt("internet https", async () => (await fetch("https://example.com/")).status);
await attempt("internet tcp by IP", () => tcp("1.1.1.1", 443));
await attempt("model provider", async () => (await fetch("https://api.openai.com/v1/models")).status);
await attempt("dns lookup", () => dns.lookup("example.com"));
await attempt("udp to resolver", () =>
  new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    socket.on("error", reject);
    socket.send(Buffer.from("x"), 53, "8.8.8.8", (error) => {
      socket.close();
      error ? reject(error) : resolve("sent");
    });
  }),
);
await attempt("cloud metadata", () => tcp("169.254.169.254", 80));
