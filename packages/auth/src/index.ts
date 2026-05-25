export {
  generateApiKey,
  hashApiKey,
  isOrgApiKey,
  canDeploy,
  canManageKeys,
  canRun,
  type OrgRole,
} from "./api-keys";
export { verifyClerkToken, type ClerkIdentity } from "./clerk";
export {
  createSamlClient,
  extractSamlIdentity,
  type SamlSpConfig,
} from "./saml";
export {
  signSamlSession,
  verifySamlSession,
  newSamlRequestId,
  type SamlSessionPayload,
} from "./saml-session";

export type AuthMode = "dev" | "clerk" | "keys" | "saml" | "mixed";

export interface AuthContext {
  orgId: string;
  userId?: string;
  role: import("./api-keys").OrgRole;
  /** How this request was authenticated. */
  method: "dev" | "platform" | "api_key" | "clerk" | "saml";
}
