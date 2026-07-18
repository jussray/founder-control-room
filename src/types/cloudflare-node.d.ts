declare module 'cloudflare:node' {
  export function httpServerHandler(
    server: import('node:http').Server | { port: number },
  ): import('@cloudflare/workers-types').ExportedHandler;
}
