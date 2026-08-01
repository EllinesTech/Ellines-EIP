/** Per-user+org side nav order (Owner/IT rearrange). */

export function navOrderStorageKey(orgId: string, userId: string): string {
  return `eip_nav_order:${orgId}:${userId}`;
}

export function readNavOrder(orgId: string, userId: string): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(navOrderStorageKey(orgId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((h): h is string => typeof h === 'string' && h.length > 0);
  } catch {
    return null;
  }
}

export function writeNavOrder(orgId: string, userId: string, hrefs: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(navOrderStorageKey(orgId, userId), JSON.stringify(hrefs));
  } catch {
    /* quota / private mode */
  }
}

/** Older builds put Ask (`/app/ellinea`) in the Owner/IT nav as “Console”. */
const NAV_HREF_ALIASES: Record<string, string> = {
  '/app/ellinea': '/app/ellinea-console',
};

/**
 * Apply a saved href order onto the current default (visible) list.
 * Unknown saved hrefs are dropped; new default items insert at their
 * default relative position among already-ordered neighbors.
 */
export function mergeNavOrder(defaultHrefs: string[], saved: string[] | null): string[] {
  if (!saved?.length) return [...defaultHrefs];
  const visible = new Set(defaultHrefs);
  const remapped = saved.map((h) => NAV_HREF_ALIASES[h] ?? h);
  const result: string[] = [];
  for (const href of remapped) {
    if (!visible.has(href) || result.includes(href)) continue;
    result.push(href);
  }
  for (const href of defaultHrefs) {
    if (result.includes(href)) continue;
    const idxInDefault = defaultHrefs.indexOf(href);
    let insertAt = 0;
    for (let i = 0; i < idxInDefault; i++) {
      const pos = result.indexOf(defaultHrefs[i]);
      if (pos !== -1) insertAt = pos + 1;
    }
    result.splice(insertAt, 0, href);
  }
  return result;
}

export function reorderNavHrefs(hrefs: string[], fromHref: string, toHref: string): string[] {
  if (fromHref === toHref) return hrefs;
  const next = [...hrefs];
  const from = next.indexOf(fromHref);
  const to = next.indexOf(toHref);
  if (from < 0 || to < 0) return hrefs;
  next.splice(from, 1);
  next.splice(to, 0, fromHref);
  return next;
}
