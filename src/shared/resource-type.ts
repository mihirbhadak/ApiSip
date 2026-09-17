/** Chrome webRequest and CDP use different names for the same traffic. */
export function normalizeResourceType(value: string): string {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');
  const aliases: Record<string, string> = {
    xmlhttprequest: 'xhr',
    xhr: 'xhr',
    mainframe: 'document',
    subframe: 'document',
    subdocument: 'document',
    document: 'document',
    imageset: 'image',
    cspreport: 'csp_report',
    signedexchange: 'signed_exchange',
  };
  return aliases[key] ?? key;
}
