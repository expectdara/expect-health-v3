import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  patients: defineTable({
    userId: v.string(),
    email: v.string(),
    name: v.string(),
    ans: v.any(),
    iciq: v.any(),
    pain: v.any(),
    gupi: v.any(),
    fluts: v.any(),
    fsex: v.any(),
    plan: v.any(),
    depressionFlag: v.any(),
    prenatalFlag: v.boolean(),
    physicianName: v.optional(v.string()),
    physicianFax: v.optional(v.string()),
    physicianNPI: v.optional(v.string()),
    safetyAnswerChanged: v.boolean(),
    safetyChanges: v.any(),
    outcomeRecordId: v.optional(v.string()),
    week8: v.optional(v.any()),
    psiRefer: v.optional(v.boolean()),
    status: v.string(),
    isDemo: v.optional(v.boolean()),
    createdAt: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  sessions: defineTable({
    userId: v.string(),
    email: v.string(),
    sessionToken: v.string(),
    expiresAt: v.number(),
    createdAt: v.string(),
  })
    .index("by_token", ["sessionToken"])
    .index("by_userId", ["userId"]),

  auditEvents: defineTable({
    eventId: v.string(),
    ts: v.string(),
    type: v.string(),
    details: v.any(),
    userId: v.optional(v.string()),
  })
    .index("by_type", ["type"])
    .index("by_ts", ["ts"]),

  outcomeRecords: defineTable({
    recordId: v.string(),
    baseline: v.any(),
    treatment: v.any(),
    outcome: v.optional(v.any()),
    createdAt: v.string(),
  }).index("by_recordId", ["recordId"]),

  demoPatients: defineTable({
    demoId: v.string(),
    data: v.any(),
  }).index("by_demoId", ["demoId"]),
});
