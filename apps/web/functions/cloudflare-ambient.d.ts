/** Ambient modules for Pages Functions typecheck (not shipped to browsers). */
declare module 'cloudflare:sockets' {
  export type SocketOptions = {
    hostname: string;
    port: number;
    secureTransport?: 'on' | 'starttls' | 'off';
  };

  export type Socket = {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    opened: Promise<unknown>;
    close: () => void;
    startTls?: () => void;
  };

  export function connect(opts: SocketOptions): Socket;
}
