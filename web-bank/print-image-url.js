// Preserve the already verified image bytes for native export. Fetching blob:
// URLs is intentionally not allowed by the production connect-src policy.
const images=new Map();
export function printImageUrl(blob){const url=URL.createObjectURL(blob);images.set(url,blob);return url;}
export function printImageBlob(url){return images.get(url);}
export function releasePrintImage(url){images.delete(url);URL.revokeObjectURL(url);}
