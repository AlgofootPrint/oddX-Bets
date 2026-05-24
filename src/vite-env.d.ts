/// <reference types="vite/client" />

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
}

interface Window {
  okxwallet?: Eip1193Provider;
  ethereum?: Eip1193Provider;
}
