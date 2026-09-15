// Types are scoped to the CDP Network fields actually consumed by this adapter.
export interface CdpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  hasPostData?: boolean;
}
export interface CdpResponse {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  mimeType?: string;
  protocol?: string;
  encodedDataLength?: number;
  fromDiskCache?: boolean;
  fromServiceWorker?: boolean;
  remoteIPAddress?: string;
  securityState?: string;
  timing?: {
    dnsStart: number;
    dnsEnd: number;
    connectStart: number;
    connectEnd: number;
    sslStart: number;
    sslEnd: number;
    sendStart: number;
    sendEnd: number;
    receiveHeadersEnd: number;
  };
}
export interface CdpEvent {
  requestId?: string;
  request?: CdpRequest;
  response?: CdpResponse;
  redirectResponse?: CdpResponse;
  timestamp?: number;
  wallTime?: number;
  documentURL?: string;
  frameId?: string;
  type?: string;
  initiator?: { type: string; url?: string; stack?: { callFrames?: { url: string }[] } };
  encodedDataLength?: number;
  errorText?: string;
  blockedReason?: string;
  canceled?: boolean;
  sessionId?: string;
  targetInfo?: { type: string };
  url?: string;
}
