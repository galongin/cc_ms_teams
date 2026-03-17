/**
 * Information about an active tunnel.
 */
export interface TunnelInfo {
  /** The public HTTPS URL exposed by the tunnel. */
  url: string;
  /** The tunnel identifier (for persistence / reuse). */
  tunnelId: string;
  /** The local port being tunnelled. */
  port: number;
  /** Which provider is in use. */
  provider: 'devtunnel' | 'ngrok';
}

/**
 * The lifecycle status of a tunnel.
 */
export type TunnelStatus =
  | 'stopped'
  | 'starting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

/**
 * Handler invoked when the tunnel status changes.
 */
export type StatusChangeHandler = (status: TunnelStatus, info?: TunnelInfo) => void;

/**
 * Interface that all tunnel providers must implement.
 */
export interface ITunnelProvider {
  /** Human-readable name of the provider. */
  readonly name: string;

  /** Start the tunnel and return the connection info. */
  start(port: number): Promise<TunnelInfo>;

  /** Gracefully stop the tunnel. */
  stop(): Promise<void>;

  /** Get the current public URL, or null if not connected. */
  getUrl(): string | null;

  /** Get the current status. */
  getStatus(): TunnelStatus;

  /** Register a handler for status changes. */
  onStatusChange(handler: StatusChangeHandler): void;

  /** Check whether the provider CLI is available on this system. */
  isAvailable(): Promise<boolean>;
}
