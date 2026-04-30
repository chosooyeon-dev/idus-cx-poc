/**
 * Rule engine unit tests — Python python-backend test 17/17 cases를 그대로 직역.
 *
 * 영상·아키 메모·KPI에 "TS 룰엔진 17 케이스 검증 통과" 인용 근거.
 */
import { describe, expect, it } from "vitest";
import {
  adjudicateRefund,
  type Decision,
  type OrderStage,
  type PolicyType,
} from "./refund_policy";

interface Case {
  policy: PolicyType;
  stage: OrderStage;
  used: boolean;
  dsd: number | null;
  count: number;
  expectedDecision: Decision;
  expectedPercent: 0 | 50 | 100;
  label: string;
}

const cases: Case[] = [
  { policy: "full_refund", stage: "pre_shipment", used: false, dsd: null, count: 1, expectedDecision: "full", expectedPercent: 100, label: "full_refund / pre_shipment" },
  { policy: "full_refund", stage: "delivered", used: false, dsd: 1, count: 1, expectedDecision: "full", expectedPercent: 100, label: "full_refund / delivered / 1d" },
  { policy: "full_refund", stage: "delivered", used: true, dsd: 5, count: 1, expectedDecision: "none", expectedPercent: 0, label: "full_refund / delivered / used" },
  { policy: "full_refund", stage: "delivered", used: false, dsd: 14, count: 1, expectedDecision: "none", expectedPercent: 0, label: "full_refund / delivered / 14d" },

  { policy: "no_refund_after_start", stage: "pre_production", used: false, dsd: null, count: 1, expectedDecision: "full", expectedPercent: 100, label: "no_refund_after_start / pre_production" },
  { policy: "no_refund_after_start", stage: "in_production", used: false, dsd: null, count: 1, expectedDecision: "none", expectedPercent: 0, label: "no_refund_after_start / in_production" },
  { policy: "no_refund_after_start", stage: "delivered", used: false, dsd: null, count: 1, expectedDecision: "none", expectedPercent: 0, label: "no_refund_after_start / delivered" },

  { policy: "partial_only", stage: "pre_production", used: false, dsd: null, count: 1, expectedDecision: "full", expectedPercent: 100, label: "partial_only / pre_production" },
  { policy: "partial_only", stage: "in_production", used: false, dsd: null, count: 1, expectedDecision: "partial", expectedPercent: 50, label: "partial_only / in_production" },
  { policy: "partial_only", stage: "pre_shipment", used: false, dsd: null, count: 1, expectedDecision: "partial", expectedPercent: 50, label: "partial_only / pre_shipment" },
  { policy: "partial_only", stage: "delivered", used: false, dsd: null, count: 1, expectedDecision: "none", expectedPercent: 0, label: "partial_only / delivered" },
  { policy: "partial_only", stage: "delivered", used: true, dsd: null, count: 1, expectedDecision: "none", expectedPercent: 0, label: "partial_only / delivered / used" },

  { policy: "case_by_case", stage: "in_production", used: false, dsd: null, count: 1, expectedDecision: "human_review", expectedPercent: 0, label: "case_by_case / in_production" },
  { policy: "case_by_case", stage: "delivered", used: false, dsd: null, count: 1, expectedDecision: "human_review", expectedPercent: 0, label: "case_by_case / delivered" },

  // Escalation: inquiry_count >= 3 → 정책과 무관하게 human_review
  { policy: "full_refund", stage: "pre_shipment", used: false, dsd: null, count: 3, expectedDecision: "human_review", expectedPercent: 0, label: "escalation / full_refund / count=3" },
  { policy: "no_refund_after_start", stage: "pre_production", used: false, dsd: null, count: 3, expectedDecision: "human_review", expectedPercent: 0, label: "escalation / no_refund / count=3" },
  { policy: "partial_only", stage: "in_production", used: false, dsd: null, count: 4, expectedDecision: "human_review", expectedPercent: 0, label: "escalation / partial_only / count=4" },
];

describe("adjudicateRefund (17 cases)", () => {
  for (const c of cases) {
    it(c.label, () => {
      const v = adjudicateRefund({
        artist_policy_type: c.policy,
        artist_policy_text: "(test)",
        order_stage: c.stage,
        artist_id: "aXX",
        order_id: "oXX",
        used: c.used,
        days_since_delivery: c.dsd,
        inquiry_count: c.count,
      });
      expect(v.decision).toBe(c.expectedDecision);
      expect(v.refund_percent).toBe(c.expectedPercent);
    });
  }

  it("returns sources-friendly fields", () => {
    const v = adjudicateRefund({
      artist_policy_type: "no_refund_after_start",
      artist_policy_text: "policy text",
      order_stage: "in_production",
      artist_id: "a01",
      order_id: "1234",
    });
    expect(v.cited_policy).toBe("policy text");
    expect(v.artist_id).toBe("a01");
    expect(v.order_id).toBe("1234");
    expect(v.inquiry_count).toBe(1);
    expect(v.next_steps.length).toBeGreaterThan(0);
  });
});
