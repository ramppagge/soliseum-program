export type SolanaCluster = "devnet" | "testnet" | "mainnet-beta";

/** App cluster - used by WalletContextProvider and NetworkGuardian */
export const APP_CLUSTER: SolanaCluster = "devnet";

/** Backend API URL (REST) - defaults to localhost:4000 */
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** Backend Socket.io URL - defaults to localhost:4001 */
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4001";

/** Protected routes that require wallet connection (Gatekeeper overlay) */
export const PROTECTED_ROUTES = ["/agents", "/stakes"];

export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route) || pathname === route);
}
