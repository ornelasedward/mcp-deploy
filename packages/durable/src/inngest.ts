import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "agentd" });

export type AgentRunEvent = {
  name: "agent/run";
  data: {
    slug: string;
    input: unknown;
    orgId: string;
    runId: string;
    source: string;
    projectId?: string;
    snapshotRef?: string;
  };
};

export type AgentResumeEvent = {
  name: "agent/resume";
  data: {
    runId: string;
    orgId: string;
    eventName: string;
    payload?: unknown;
  };
};
