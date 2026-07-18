declare module 'cloudflare:node' {
  export function httpServerHandler(
    server: import('node:http').Server | { port: number },
  ): import('@cloudflare/workers-types').ExportedHandler;
}

declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
