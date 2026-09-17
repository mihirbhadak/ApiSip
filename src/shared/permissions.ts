/** Capture needs access to both the requesting page and cross-origin API hosts. */
export const captureOrigins = ['http://*/*', 'https://*/*'];
export const capturePermissions: chrome.permissions.Permissions = {
  permissions: ['webRequest'],
  origins: captureOrigins,
};
export const hasCaptureAccess = () => chrome.permissions.contains(capturePermissions);
/** Call directly from a click handler so Chrome retains the user gesture. */
export const requestCaptureAccess = () => chrome.permissions.request(capturePermissions);
