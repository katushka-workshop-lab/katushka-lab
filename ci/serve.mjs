/* global URL, process, console */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Loopback-only static hosting; the root can change only through this local test API.
export async function startMirrorServer(initialRoot, port = 3042, prefix = "/katushka-pwa-mirror/") {
  let root = path.resolve(initialRoot);
  if (!/^\/[a-z0-9-]+\/$/.test(prefix)) throw Error("Invalid test path");
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
  const server = http.createServer(async (req, res) => {
    if (!["GET", "HEAD"].includes(req.method)) return res.writeHead(405).end();
    let url, relative;
    try { url = new URL(req.url, `http://127.0.0.1:${port}`); relative = decodeURIComponent(url.pathname); } catch { return res.writeHead(400).end(); }
    if (relative === prefix.slice(0, -1)) return res.writeHead(301, { Location: prefix + url.search }).end();
    if (!relative.startsWith(prefix)) return res.writeHead(404).end();
    const activeRoot = root;
    let filename = path.resolve(activeRoot, relative.slice(prefix.length));
    if (filename !== activeRoot && !filename.startsWith(activeRoot + path.sep)) return res.writeHead(403).end();
    try {
      if ((await fs.stat(filename)).isDirectory()) {
        if (!url.pathname.endsWith("/")) return res.writeHead(301, { Location: url.pathname + "/" + url.search }).end();
        filename = path.join(filename, "index.html");
      }
      const bytes = await fs.readFile(filename);
      res.writeHead(200, { "Content-Type": types[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-store" }); res.end(req.method === "HEAD" ? undefined : bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return { origin: `http://127.0.0.1:${port}`, usePackage(nextRoot) { root = path.resolve(nextRoot); }, close: () => new Promise(resolve => server.close(resolve)) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startMirrorServer("main-mirror-package"); console.log(`${server.origin}/katushka-pwa-mirror/ — local only`);
}
