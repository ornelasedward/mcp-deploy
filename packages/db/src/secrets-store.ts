import { eq, and } from "drizzle-orm";
import type { Database } from "./index";
import { projectSecrets, projects } from "./schema";
import { decryptSecret, encryptSecret } from "./crypto";

export class SecretsStore {
  private mem = new Map<string, Map<string, string>>();

  constructor(
    private db?: Database,
    private encryptionKey?: string,
  ) {}

  private memKey(projectId: string) {
    return projectId;
  }

  async assertProjectInOrg(projectId: string, orgId: string): Promise<boolean> {
    if (!this.db) return true;
    const rows = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
      .limit(1);
    return rows.length > 0;
  }

  async listNames(projectId: string): Promise<string[]> {
    if (this.db) {
      const rows = await this.db
        .select({ name: projectSecrets.name })
        .from(projectSecrets)
        .where(eq(projectSecrets.projectId, projectId));
      return rows.map((r) => r.name);
    }
    const m = this.mem.get(this.memKey(projectId));
    return m ? [...m.keys()] : [];
  }

  async upsert(projectId: string, name: string, value: string): Promise<void> {
    if (this.db) {
      if (!this.encryptionKey) {
        throw new Error("SECRETS_ENCRYPTION_KEY required to store secrets");
      }
      const { ciphertext, iv } = encryptSecret(value, this.encryptionKey);
      await this.db
        .insert(projectSecrets)
        .values({ projectId, name, ciphertext, iv })
        .onConflictDoUpdate({
          target: [projectSecrets.projectId, projectSecrets.name],
          set: { ciphertext, iv, updatedAt: new Date() },
        });
      return;
    }
    let m = this.mem.get(this.memKey(projectId));
    if (!m) {
      m = new Map();
      this.mem.set(this.memKey(projectId), m);
    }
    m.set(name, value);
  }

  async remove(projectId: string, name: string): Promise<boolean> {
    if (this.db) {
      const deleted = await this.db
        .delete(projectSecrets)
        .where(and(eq(projectSecrets.projectId, projectId), eq(projectSecrets.name, name)))
        .returning({ id: projectSecrets.id });
      return deleted.length > 0;
    }
    const m = this.mem.get(this.memKey(projectId));
    return m?.delete(name) ?? false;
  }

  async loadForProject(projectId: string): Promise<Record<string, string>> {
    if (this.db) {
      if (!this.encryptionKey) return {};
      const rows = await this.db
        .select()
        .from(projectSecrets)
        .where(eq(projectSecrets.projectId, projectId));
      const out: Record<string, string> = {};
      for (const row of rows) {
        out[row.name] = decryptSecret(row.ciphertext, row.iv, this.encryptionKey);
      }
      return out;
    }
    const m = this.mem.get(this.memKey(projectId));
    return m ? Object.fromEntries(m) : {};
  }
}
