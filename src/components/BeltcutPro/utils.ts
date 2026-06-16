/**
 * Helper utility functions for BeltcutPro
 */

/**
 * Extract a shortened parent roll ID from a long ID string.
 * e.g., "PTB028 TRD/05062026/PNO28/SN338" -> "PTB028-SN338"
 */
export const getShortParentId = (parentId: string): string => {
  if (!parentId) return '';
  const parts = parentId.trim().split(/[\s/]+/);
  if (parts.length > 0) {
    const firstPart = parts[0]; // e.g. "PTB028"
    
    // Look for serial number (part containing "SN")
    const snPart = parts.find(p => p.toUpperCase().includes('SN'));
    if (snPart) {
      return `${firstPart}-${snPart}`;
    }
    
    // If no SN part, look for PNO part
    const pnoPart = parts.find(p => p.toUpperCase().includes('PNO'));
    if (pnoPart) {
      return `${firstPart}-${pnoPart}`;
    }
    
    // Fallback: firstPart + last part (if it exists)
    if (parts.length > 1) {
      return `${firstPart}-${parts[parts.length - 1]}`;
    }
    return firstPart;
  }
  return parentId;
};

/**
 * Returns a shortened, display-friendly version of a Roll ID.
 * Supports REUSE, INV, and SCRAP prefixes.
 * e.g., "REUSE-PTB028 TRD/05062026/PNO28/SN338-C-1781590604458-41080" -> "REUSE-PTB028-SN338-C-41080"
 * e.g., "REUSE-PTB028 TRD/05062026/PNO28/SN338-41080" -> "REUSE-PTB028-SN338-41080"
 */
export const getShortRollId = (id: string): string => {
  if (!id) return '';
  
  const prefixes = ['REUSE-', 'INV-', 'SCRAP-'];
  const matchedPrefix = prefixes.find(p => id.startsWith(p));
  
  if (matchedPrefix) {
    const prefix = matchedPrefix.slice(0, -1); // "REUSE", "INV", or "SCRAP"
    const rest = id.substring(matchedPrefix.length); // e.g. "PTB028 TRD/05062026/PNO28/SN338-C-1781590604458-41080"
    
    // Case 1: contains a Cut ID separator "-C-"
    if (rest.includes('-C-')) {
      const cIndex = rest.lastIndexOf('-C-');
      const parentId = rest.substring(0, cIndex);
      const cutPart = rest.substring(cIndex + 1); // "C-1781590604458-41080"
      
      const parentClean = getShortParentId(parentId);
      
      const cutSubParts = cutPart.split('-');
      // Keep last part of cut ID (e.g. C-41080)
      const shortCut = cutSubParts.length > 1 ? `C-${cutSubParts[cutSubParts.length - 1]}` : cutPart;
      
      return `${prefix}-${parentClean}-${shortCut}`;
    }
    
    // Case 2: contains a standard last dash with a short suffix
    const lastDashIndex = rest.lastIndexOf('-');
    if (lastDashIndex !== -1) {
      const parentId = rest.substring(0, lastDashIndex);
      const suffix = rest.substring(lastDashIndex + 1);
      
      // If suffix is too long, we can slice it
      const cleanSuffix = suffix.length > 6 ? suffix.slice(-5) : suffix;
      const parentClean = getShortParentId(parentId);
      
      return `${prefix}-${parentClean}-${cleanSuffix}`;
    }
    
    // Fallback if no dashes in the rest
    return `${prefix}-${getShortParentId(rest)}`;
  }
  
  // For standard non-reuse IDs, if they are extremely long, clean them up slightly for display
  if (id.includes('/') || id.includes(' ')) {
    return getShortParentId(id);
  }
  
  return id;
};
