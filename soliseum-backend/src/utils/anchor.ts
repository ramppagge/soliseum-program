/**
 * Shared Anchor instruction discriminator helper.
 * Computes the 8-byte SHA-256 prefix used by Anchor for instruction dispatch.
 */

import * as crypto from "crypto";

export function getInstructionDiscriminator(ixName: string): Buffer {
  const preimage = `global:${ixName}`;
  return crypto.createHash("sha256").update(preimage).digest().subarray(0, 8);
}
