import net from 'node:net';

const PORT = 3100;
const HOST = '0.0.0.0';
const MESSAGE = '이미 3100 포트를 점유 중인 프로세스가 있습니다.';

const server = net.createServer();

server.once('error', (error) => {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
    console.error(MESSAGE);
    process.exit(1);
    return;
  }
  console.error('포트 점검 중 알 수 없는 오류가 발생했습니다.');
  process.exit(1);
});

server.once('listening', () => {
  server.close(() => {
    process.exit(0);
  });
});

server.listen(PORT, HOST);
