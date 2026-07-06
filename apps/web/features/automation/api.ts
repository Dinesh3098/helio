import { api } from "@/lib/api/client";
import type {
  AutomationAction,
  AutomationCondition,
  AutomationExecution,
  AutomationExecutionStatus,
  AutomationRule,
  AutomationTrigger,
  Paginated,
} from "@/types/api";

export interface SaveRuleInput {
  name: string;
  trigger: AutomationTrigger;
  enabled?: boolean;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

export interface TestRuleResult {
  matched: boolean;
  executionId?: string;
  status?: AutomationExecutionStatus;
  error?: string | null;
}

export const automationApi = {
  listRules: async () =>
    (await api.get<AutomationRule[]>("/automation/rules")).data,

  createRule: async (input: SaveRuleInput) =>
    (await api.post<AutomationRule>("/automation/rules", input)).data,

  updateRule: async ({
    id,
    ...input
  }: Partial<SaveRuleInput> & { id: string }) =>
    (await api.patch<AutomationRule>(`/automation/rules/${id}`, input)).data,

  deleteRule: async (id: string) => {
    await api.delete(`/automation/rules/${id}`);
  },

  /** Runs the rule for real against a conversation (actions execute). */
  testRule: async (id: string, conversationId: string) =>
    (
      await api.post<TestRuleResult>(`/automation/rules/${id}/test`, {
        conversationId,
      })
    ).data,

  history: async (params: { ruleId?: string; page: number }) =>
    (
      await api.get<Paginated<AutomationExecution>>("/automation/history", {
        params,
      })
    ).data,
};
