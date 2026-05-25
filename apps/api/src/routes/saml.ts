import { Hono } from "hono";
import type { Config } from "@platform/config";
import type { OrgStore } from "@platform/db";
import {
  createSamlClient,
  extractSamlIdentity,
  signSamlSession,
} from "@platform/auth";

function samlConfigured(config: Config): boolean {
  return Boolean(
    config.SAML_ENABLED &&
      config.SAML_SP_ENTITY_ID &&
      config.SAML_SP_ACS_URL &&
      config.SAML_IDP_SSO_URL &&
      config.SAML_IDP_CERT &&
      config.SAML_SESSION_SECRET,
  );
}

export function samlRoutes(config: Config, orgStore?: OrgStore) {
  const app = new Hono();

  app.get("/v1/auth/saml/metadata", async (c) => {
    if (!samlConfigured(config)) return c.json({ error: "SAML not configured" }, 503);
    const client = createSamlClient({
      entityId: config.SAML_SP_ENTITY_ID!,
      acsUrl: config.SAML_SP_ACS_URL!,
      idpSsoUrl: config.SAML_IDP_SSO_URL!,
      idpCert: config.SAML_IDP_CERT!.replace(/\\n/g, "\n"),
      spPrivateKey: config.SAML_SP_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      spCert: config.SAML_SP_CERT?.replace(/\\n/g, "\n"),
    });
    const xml = client.generateServiceProviderMetadata(
      config.SAML_SP_CERT?.replace(/\\n/g, "\n"),
      config.SAML_SP_CERT?.replace(/\\n/g, "\n"),
    );
    return c.body(xml, 200, { "content-type": "application/xml" });
  });

  app.get("/v1/auth/saml/login", async (c) => {
    if (!samlConfigured(config)) return c.json({ error: "SAML not configured" }, 503);
    const client = createSamlClient({
      entityId: config.SAML_SP_ENTITY_ID!,
      acsUrl: config.SAML_SP_ACS_URL!,
      idpSsoUrl: config.SAML_IDP_SSO_URL!,
      idpCert: config.SAML_IDP_CERT!.replace(/\\n/g, "\n"),
      spPrivateKey: config.SAML_SP_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      spCert: config.SAML_SP_CERT?.replace(/\\n/g, "\n"),
    });
    const url = await client.getAuthorizeUrlAsync({});
    return c.redirect(url);
  });

  app.post("/v1/auth/saml/acs", async (c) => {
    if (!samlConfigured(config)) return c.json({ error: "SAML not configured" }, 503);
    const client = createSamlClient({
      entityId: config.SAML_SP_ENTITY_ID!,
      acsUrl: config.SAML_SP_ACS_URL!,
      idpSsoUrl: config.SAML_IDP_SSO_URL!,
      idpCert: config.SAML_IDP_CERT!.replace(/\\n/g, "\n"),
      spPrivateKey: config.SAML_SP_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      spCert: config.SAML_SP_CERT?.replace(/\\n/g, "\n"),
    });

    const body = await c.req.parseBody();
    const samlResponse = String(body.SAMLResponse ?? "");
    if (!samlResponse) return c.json({ error: "SAMLResponse required" }, 400);

    const { profile } = await client.validatePostResponseAsync({ SAMLResponse: samlResponse });
    const identity = extractSamlIdentity(profile as Record<string, unknown>, {
      orgAttribute: config.SAML_ORG_ATTRIBUTE,
      defaultOrgId: config.SAML_DEFAULT_ORG_ID ?? config.DEFAULT_ORG_ID,
    });

    if (orgStore) {
      await orgStore.ensureOrg(identity.orgId, identity.orgId);
      await orgStore.upsertMember(identity.orgId, identity.userId, "owner");
    }

    const token = signSamlSession(
      { sub: identity.userId, orgId: identity.orgId, email: identity.email },
      config.SAML_SESSION_SECRET!,
    );

    const redirect = c.req.query("redirect") ?? config.WEB_BASE_URL;
    const sep = redirect.includes("?") ? "&" : "?";
    return c.redirect(`${redirect}${sep}saml_token=${encodeURIComponent(token)}`);
  });

  return app;
}
