import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const START_PORT = 3100;
const END_PORT = 3199;
const HOST = '0.0.0.0';
const RETRY_ATTEMPTS = 6;
const RETRY_SLEEP_MS = 1200;
const PORT_HOLD_MS = 200;
const LOCK_STALE_MS = 45_000;
const LOCK_DIR = path.join(os.tmpdir(), 'devflow-port-locks');

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function ensureLockDir() {
  await fs.mkdir(LOCK_DIR, { recursive: true });
}

function lockPath(port) {
  return path.join(LOCK_DIR, `${port}.lock`);
}

async function isLockStale(port) {
  try {
    const stat = await fs.stat(lockPath(port));
    return Date.now() - stat.mtimeMs > LOCK_STALE_MS;
  } catch {
    return false;
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH');
  }
}

async function canRecycleLock(port) {
  const file = lockPath(port);
  try {
    const payload = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(payload);
    const pid = Number(parsed?.pid);
    if (Number.isInteger(pid) && pid > 0) {
      return !isPidAlive(pid);
    }
    return await isLockStale(port);
  } catch {
    return await isLockStale(port);
  }
}

async function acquirePortLock(port) {
  const file = lockPath(port);
  try {
    const handle = await fs.open(file, 'wx');
    await handle.writeFile(JSON.stringify({ pid: process.pid, port, createdAt: new Date().toISOString() }));
    await handle.close();
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      if (await canRecycleLock(port)) {
        try {
          await fs.rm(file);
        } catch {
          return false;
        }
        return acquirePortLock(port);
      }
      return false;
    }
    return false;
  }
}

async function releasePortLock(port) {
  try {
    await fs.rm(lockPath(port));
  } catch {
    // noop
  }
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
  await ensureLockDir();

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    for (let port = START_PORT; port <= END_PORT; port += 1) {
      // eslint-disable-next-line no-await-in-loop
      const lockAcquired = await acquirePortLock(port);
      if (!lockAcquired) {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const availableNow = await checkPortAvailable(port);
      if (!availableNow) {
        // eslint-disable-next-line no-await-in-loop
        await releasePortLock(port);
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await sleep(PORT_HOLD_MS);
      // eslint-disable-next-line no-await-in-loop
      const stillAvailable = await checkPortAvailable(port);
      if (!stillAvailable) {
        // eslint-disable-next-line no-await-in-loop
        await releasePortLock(port);
        continue;
      }

      const available = availableNow && stillAvailable;
      if (available) {
        process.stdout.write(String(port));
        process.exit(0);
        return;
      }

      // eslint-disable-next-line no-await-in-loop
      await releasePortLock(port);
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
