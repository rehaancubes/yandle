/**
 * Resolves DID (phone number) to a Voxa org/handle via the Voxa API.
 */
const API_BASE = (process.env.API_BASE_URL || "https://6kbd4veax6.execute-api.us-east-1.amazonaws.com").replace(/\/$/, "");

/**
 * @param {string} did - Incoming DID (e.g. 918035229487 or +918035229487)
 * @returns {Promise<{ handle: string, displayName?: string } | null>}
 */
async function getOrgByDid(did) {
  if (!did || typeof did !== "string") return null;
  const cleaned = did.trim().replace(/\D/g, "");
  if (!cleaned) return null;

  try {
    console.log("[db] Resolving DID via API:", cleaned);
    const res = await fetch(`${API_BASE}/public/resolve-did/${cleaned}`);
    if (!res.ok) {
      console.log("[db] API returned", res.status, "for DID:", cleaned);
      return null;
    }
    const data = await res.json();
    if (data.handle) {
      console.log("[db] ✅ Resolved DID", cleaned, "→", data.handle);
      return { handle: data.handle, displayName: data.handle };
    }
    return null;
  } catch (e) {
    console.warn("[db] ❌ API call failed for DID:", cleaned, e.message);
    return null;
  }
}

module.exports = { getOrgByDid };
