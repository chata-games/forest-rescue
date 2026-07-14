const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 4177);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://prototype").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.normalize(path.join(root, relative));
  if (!file.startsWith(root)) {
    response.writeHead(403);
    return response.end();
  }
  fs.readFile(file, (error, body) => {
    if (error) {
      response.writeHead(404);
      return response.end("Not found");
    }
    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  });
}).listen(port, "127.0.0.1", () => {
  console.log("Campaign map prototype: http://localhost:" + port + "/?variant=trail");
});
