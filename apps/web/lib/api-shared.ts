const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8787";
const DEV_ORG = process.env.NEXT_PUBLIC_DEV_ORG_ID ?? "org_dev";

export function apiBase() {
  return API_BASE.replace(/\/$/, "");
}

export function devOrgId() {
  return DEV_ORG;
}
