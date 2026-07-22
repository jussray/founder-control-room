import { createServer } from './http/server.js';

const port = Number(process.env.PORT ?? 8787);
createServer().listen(port);
