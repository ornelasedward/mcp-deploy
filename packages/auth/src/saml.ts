import { SAML, type SamlConfig } from "@node-saml/node-saml";

export interface SamlSpConfig {
  entityId: string;
  acsUrl: string;
  idpSsoUrl: string;
  idpCert: string;
  /** SP private key PEM (optional — sign AuthnRequest). */
  spPrivateKey?: string;
  spCert?: string;
}

export function createSamlClient(cfg: SamlSpConfig): SAML {
  const options: SamlConfig = {
    issuer: cfg.entityId,
    callbackUrl: cfg.acsUrl,
    entryPoint: cfg.idpSsoUrl,
    idpCert: cfg.idpCert,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true,
    signatureAlgorithm: "sha256",
    ...(cfg.spPrivateKey
      ? {
          privateKey: cfg.spPrivateKey,
          publicCert: cfg.spCert,
          signMetadata: true,
        }
      : {}),
  };
  return new SAML(options);
}

export function extractSamlIdentity(
  profile: Record<string, unknown>,
  opts: { orgAttribute?: string; defaultOrgId?: string },
): { userId: string; orgId: string; email?: string } {
  const nameId = String(profile.nameID ?? profile.nameId ?? "");
  const email = profile.email
    ? String(profile.email)
    : profile.mail
      ? String(profile.mail)
      : undefined;

  const orgAttr = opts.orgAttribute ?? "orgId";
  const attrs = (profile.attributes ?? {}) as Record<string, unknown>;
  const rawOrg = attrs[orgAttr] ?? profile[orgAttr];

  const orgId =
    (Array.isArray(rawOrg) ? rawOrg[0] : rawOrg)?.toString() ||
    opts.defaultOrgId ||
    nameId;

  return {
    userId: nameId || email || "saml-user",
    orgId,
    email,
  };
}
