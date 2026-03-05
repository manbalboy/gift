import net from 'node:net';

const START_PORT = 3100;
const END_PORT = 3199;
const HOST = '0.0.0.0';
const RETRY_ATTEMPTS = 4;
const RETRY_SLEEP_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, HOST);
  });
}

async function main() {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    for (let port = START_PORT; port <= END_PORT; port += 1) {
      // eslint-disable-next-line no-await-in-loop
      const available = await checkPortAvailable(port);
      if (available) {
        process.stdout.write(String(port));
        process.exit(0);
        return;
      }
    }
    if (attempt < RETRY_ATTEMPTS) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(RETRY_SLEEP_MS * attempt);
    }
  }
  console.error(`3100~3199 포트가 모두 사용 중입니다. (${RETRY_ATTEMPTS}회 재시도 후 종료)`);
  process.exit(1);
}

void main();
