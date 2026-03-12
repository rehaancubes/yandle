/**
 * Shared access-control helper for VOXA Lambda functions.
 * Checks if the caller is the handle owner OR an added manager via MembersTable.
 */
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB.DocumentClient();

/**
 * Asserts the caller (identified by sub + email) has owner or manager access to a handle.
 * Throws "FORBIDDEN" if access is denied, "NOT_FOUND" if the handle doesn't exist.
 */
async function assertAccess(handle, sub, email) {
  if (!process.env.HANDLES_TABLE) return; // misconfigured — let through
  const result = await ddb.get({
    TableName: process.env.HANDLES_TABLE,
    Key: { handle }
  }).promise();
  if (!result.Item) throw new Error("NOT_FOUND");
  if (result.Item.ownerId === sub) return; // owner ✓

  // Check membership
  if (email && process.env.MEMBERS_TABLE) {
    const memberRes = await ddb.get({
      TableName: process.env.MEMBERS_TABLE,
      Key: { handle, email: String(email).trim().toLowerCase() }
    }).promise();
    if (memberRes.Item) return; // manager ✓
  }

  throw new Error("FORBIDDEN");
}

/**
 * Returns true if the caller is owner or manager of the handle.
 * Does not throw — useful for conditional rendering.
 */
async function checkAccess(handle, sub, email) {
  try {
    await assertAccess(handle, sub, email);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true only if the caller is the owner (not just any manager).
 */
async function isOwner(handle, sub) {
  if (!process.env.HANDLES_TABLE) return false;
  const result = await ddb.get({
    TableName: process.env.HANDLES_TABLE,
    Key: { handle }
  }).promise();
  return result.Item?.ownerId === sub;
}

module.exports = { assertAccess, checkAccess, isOwner };
