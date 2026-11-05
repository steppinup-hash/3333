import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

// .env.local 파일에서 KEY 읽어오기
function loadEnvLocal() {
  const envPath = path.join(__dirname, '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [k, ...v] = trimmed.split('=');
        process.env[k.trim()] = v.join('=').trim();
      }
    }
  }
}

loadEnvLocal();

// MIME 타입 매핑
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // 1. /api/dust 요청 처리 (Vercel 서버리스 함수 로컬 에뮬레이션)
  if (reqUrl.pathname === '/api/dust') {
    try {
      const { default: handler } = await import('./api/dust.js');
      // Vercel req/res 간이 래퍼
      const mockReq = {
        method: req.method,
        query: Object.fromEntries(reqUrl.searchParams.entries())
      };
      const mockRes = {
        setHeader: (k, v) => res.setHeader(k, v),
        status: (code) => {
          res.statusCode = code;
          return {
            json: (data) => {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(data));
            },
            end: () => res.end()
          };
        }
      };
      await handler(mockReq, mockRes);
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: `로컬 서버 오류: ${err.message}` }));
    }
  }

  // 2. 정적 파일 호스팅 (index.html, style.css, script.js 등)
  let filePath = path.join(__dirname, reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('파일을 찾을 수 없습니다 (404)');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 로컬 테스트 서버가 실행되었습니다!`);
  console.log(`👉 브라우저 접속 주소: http://localhost:${PORT}`);
  console.log(`🔑 환경변수 KEY: ${process.env.KEY ? '정상 로드됨' : '설정 필요'}`);
  console.log(`===============================================`);
});

