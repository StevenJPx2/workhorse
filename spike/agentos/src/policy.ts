// The part of Workhorse's universal sandbox policy this spike exercises, compiled to agentOS
// options. Egress is the broker only: the guest gets no other route out of the VM.
import { AgentOs } from "@rivet-dev/agentos-core";

export type Root = { guest: string; host: string; mode: "read" | "read-write" };

export type Policy = {
  roots: readonly Root[];
  /** Host loopback port of the broker; `undefined` means no egress at all. */
  brokerPort: number | undefined;
  environment: Readonly<Record<string, string>>;
  memoryMb: number;
  maxProcesses: number;
};

// agentOS's `network: "deny"` shorthand: VM-local listeners and loopback keep working.
const VM_LOCAL_RULES = [
  { mode: "allow", operations: ["listen"], patterns: ["tcp://**", "unix:**"] },
  { mode: "allow", operations: ["http"], patterns: ["tcp://127.0.0.1:*", "tcp://localhost:*", "tcp://::1:*", "unix:**"] },
] as const;

export function compile(policy: Policy): Parameters<typeof AgentOs.create>[0] {
  const brokerRules =
    policy.brokerPort === undefined
      ? []
      : [{ mode: "allow" as const, operations: ["*"], patterns: [`tcp://127.0.0.1:${policy.brokerPort}`] }];
  return {
    mounts: policy.roots.map((root) => ({
      path: root.guest,
      plugin: { id: "host_dir", config: { hostPath: root.host } },
      readOnly: root.mode === "read",
    })),
    permissions: {
      network: { default: "deny", rules: [...VM_LOCAL_RULES.map((rule) => ({ ...rule, operations: [...rule.operations], patterns: [...rule.patterns] })), ...brokerRules] },
    },
    loopbackExemptPorts: policy.brokerPort === undefined ? [] : [policy.brokerPort],
    environment: { ...policy.environment },
    limits: {
      jsRuntime: { v8HeapLimitMb: policy.memoryMb },
      resources: { maxProcesses: policy.maxProcesses },
    },
  };
}

export const openVm = (policy: Policy) => AgentOs.create(compile(policy));
