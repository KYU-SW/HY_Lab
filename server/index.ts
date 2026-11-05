import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { registerApiRoutes } from "./api";
import { initPush, startPushScheduler } from "./push";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const isProd = process.env.NODE_ENV === "production";

  app.use(express.json({ limit: "3mb" }));
  app.use(express.urlencoded({ extended: false }));
  initPush();
  startPushScheduler();
  registerApiRoutes(app);

  if (isProd) {
    // 프로덕션: 빌드된 정적 파일 + API를 같은 서버/포트에서 함께 서빙
    const staticPath = path.resolve(__dirname, "public");
    app.use(express.static(staticPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });

    const port = process.env.PORT || 3000;
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  } else {
    // 개발: 정적 파일은 Vite(3000번 포트)가 서빙하고, 이 서버는 /api만 담당.
    // vite.config.ts의 server.proxy 설정이 /api 요청을 이 포트로 전달함.
    const port = process.env.API_PORT || 4000;
    server.listen(port, () => {
      console.log(`API server running on http://localhost:${port}/ (vite dev server proxies /api here)`);
    });
  }
}

startServer().catch(console.error);
