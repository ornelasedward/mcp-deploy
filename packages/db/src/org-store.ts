import { eq, and, isNull } from "drizzle-orm";
type OrgRole = "owner" | "member" | "viewer";
import type { Database } from "./index";
import { apiKeys, budgets, orgMembers, orgs, projects } from "./schema";

export class OrgStore {
  constructor(private db: Database) {}

  async ensureOrg(id: string, name: string): Promise<void> {
    await this.db.insert(orgs).values({ id, name }).onConflictDoNothing();
    const budget = await this.db.select().from(budgets).where(eq(budgets.orgId, id)).limit(1);
    if (!budget[0]) {
      await this.db.insert(budgets).values({
        orgId: id,
        monthlyCapUsd: 50,
        perRunCapUsd: 0.5,
        hardStop: true,
      });
    }
  }

  async upsertMember(orgId: string, userId: string, role: OrgRole): Promise<void> {
    await this.ensureOrg(orgId, orgId);
    await this.db
      .insert(orgMembers)
      .values({ orgId, userId, role })
      .onConflictDoUpdate({
        target: [orgMembers.orgId, orgMembers.userId],
        set: { role },
      });
  }

  async getMemberRole(orgId: string, userId: string): Promise<OrgRole | null> {
    const rows = await this.db
      .select()
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .limit(1);
    const role = rows[0]?.role;
    if (role === "owner" || role === "member" || role === "viewer") return role;
    return null;
  }

  async listProjects(orgId: string) {
    return this.db.select().from(projects).where(eq(projects.orgId, orgId));
  }

  async createProject(orgId: string, repo: string, framework?: string) {
    const [row] = await this.db
      .insert(projects)
      .values({ orgId, repo, framework: framework ?? "agentd" })
      .returning();
    return row!;
  }

  async getProject(orgId: string, projectId: string) {
    const rows = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async deleteProject(orgId: string, projectId: string): Promise<boolean> {
    const row = await this.getProject(orgId, projectId);
    if (!row) return false;
    await this.db.delete(projects).where(eq(projects.id, projectId));
    return true;
  }

  async createApiKey(orgId: string, name: string, keyHash: string, keyPrefix: string, role: OrgRole) {
    const [row] = await this.db
      .insert(apiKeys)
      .values({ orgId, name, keyHash, keyPrefix, role })
      .returning({
        id: apiKeys.id,
        orgId: apiKeys.orgId,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        role: apiKeys.role,
        createdAt: apiKeys.createdAt,
      });
    return row!;
  }

  async listApiKeys(orgId: string) {
    return this.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        role: apiKeys.role,
        createdAt: apiKeys.createdAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.orgId, orgId), isNull(apiKeys.revokedAt)));
  }

  async revokeApiKey(orgId: string, keyId: string): Promise<boolean> {
    const rows = await this.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.orgId, orgId)))
      .returning();
    return rows.length > 0;
  }

  async resolveApiKey(keyHash: string): Promise<{ orgId: string; role: OrgRole; keyId: string } | null> {
    const rows = await this.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const role = row.role as OrgRole;
    if (role !== "owner" && role !== "member" && role !== "viewer") return null;
    return { orgId: row.orgId, role, keyId: row.id };
  }
}
