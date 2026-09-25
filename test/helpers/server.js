'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function startServer() {
  const dbPath = path.join(
    os.tmpdir(),
    `jf-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
  const port = 3500 + Math.floor(Math.random() * 400);

  const child = spawn('node', ['server/server.js'], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderrBuf = '';
  child.stderr.on('data', (c) => { stderrBuf += c.toString(); });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`startup timeout. stderr: ${stderrBuf}`));
    }, 15000);

    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('server running')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`server exited ${code}. stderr: ${stderrBuf}`));
    });
  });

  return {
    baseURL: `http://localhost:${port}`,
    dbPath,
    stop() {
      child.kill('SIGTERM');
      for (const s of ['', '-wal', '-shm']) {
        try { fs.rmSync(dbPath + s, { force: true }); } catch (_) {}
      }
    }
  };
}

module.exports = { startServer };
