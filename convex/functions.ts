import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ===== SESSIONS =====

export const createSession = mutation({
  args: {
    userId: v.string(),
    email: v.string(),
    sessionToken: v.string(),
    expiresAt: v.number(),
    createdAt: v.string(),
    ptName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sessions", args);
  },
});

export const getSessionByToken = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("sessionToken", args.sessionToken))
      .first();
  },
});

export const deleteSession = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("sessionToken", args.sessionToken))
      .first();
    if (session) await ctx.db.delete(session._id);
  },
});

// ===== PATIENTS =====

export const upsertPatient = mutation({
  args: {
    userId: v.string(),
    email: v.string(),
    name: v.string(),
    ans: v.any(),
    iciq: v.any(),
    pain: v.any(),
    gupi: v.any(),
    fluts: v.any(),
    fsex: v.any(),
    popdi: v.optional(v.any()),
    plan: v.any(),
    depressionFlag: v.any(),
    prenatalFlag: v.boolean(),
    physicianName: v.optional(v.string()),
    physicianFax: v.optional(v.string()),
    physicianNPI: v.optional(v.string()),
    safetyAnswerChanged: v.boolean(),
    safetyChanges: v.any(),
    passwordHash: v.optional(v.string()),
    salt: v.optional(v.string()),
    status: v.string(),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("patients")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) {
      const { createdAt, ...updateFields } = args;
      await ctx.db.patch(existing._id, updateFields);
      return existing._id;
    }
    return await ctx.db.insert("patients", args);
  },
});

export const getPatientByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("patients")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const getPatientByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("patients")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

export const listPatients = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("patients").collect();
  },
});

export const listPatientsByStatus = query({
  args: { status: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("patients")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
  },
});

export const updatePatientPlan = mutation({
  args: {
    userId: v.string(),
    plan: v.any(),
    status: v.optional(v.string()),
    outcomeRecordId: v.optional(v.string()),
    psiRefer: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const patient = await ctx.db
      .query("patients")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    if (!patient) throw new Error("Patient not found");
    const updates: Record<string, unknown> = { plan: args.plan };
    if (args.status !== undefined) updates.status = args.status;
    if (args.outcomeRecordId !== undefined) updates.outcomeRecordId = args.outcomeRecordId;
    if (args.psiRefer !== undefined) updates.psiRefer = args.psiRefer;
    await ctx.db.patch(patient._id, updates);
  },
});

export const updatePatientWeek8 = mutation({
  args: {
    userId: v.string(),
    week8: v.any(),
  },
  handler: async (ctx, args) => {
    const patient = await ctx.db
      .query("patients")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    if (!patient) throw new Error("Patient not found");
    await ctx.db.patch(patient._id, { week8: args.week8 });
  },
});

// ===== AUDIT EVENTS =====

export const insertAuditEvent = mutation({
  args: {
    eventId: v.string(),
    ts: v.string(),
    type: v.string(),
    details: v.any(),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditEvents", args);
  },
});

export const listAuditEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const q = ctx.db.query("auditEvents").order("desc");
    return await q.take(args.limit || 1000);
  },
});

// ===== OUTCOME RECORDS =====

export const insertOutcomeRecord = mutation({
  args: {
    recordId: v.string(),
    baseline: v.any(),
    treatment: v.any(),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("outcomeRecords", args);
  },
});

export const completeOutcomeRecord = mutation({
  args: {
    recordId: v.string(),
    outcome: v.any(),
  },
  handler: async (ctx, args) => {
    const rec = await ctx.db
      .query("outcomeRecords")
      .withIndex("by_recordId", (q) => q.eq("recordId", args.recordId))
      .first();
    if (!rec) throw new Error("Outcome record not found");
    await ctx.db.patch(rec._id, { outcome: args.outcome });
  },
});

export const listOutcomeRecords = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("outcomeRecords").collect();
  },
});

// ===== DEMO PATIENTS =====

export const seedDemoPatient = mutation({
  args: {
    demoId: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("demoPatients")
      .withIndex("by_demoId", (q) => q.eq("demoId", args.demoId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { data: args.data });
      return existing._id;
    }
    return await ctx.db.insert("demoPatients", args);
  },
});

export const listDemoPatients = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("demoPatients").collect();
  },
});

// ===== PT USERS =====

export const createPtUser = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
    salt: v.string(),
    role: v.string(),
    active: v.boolean(),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ptUsers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) throw new Error("PT user with this email already exists");
    return await ctx.db.insert("ptUsers", args);
  },
});

export const getPtUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ptUsers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

export const listPtUsers = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("ptUsers").collect();
    return users.map(({ passwordHash, salt, ...safe }) => safe);
  },
});

// ===== ADHERENCE LOGS =====

export const logAdherenceEntry = mutation({
  args: {
    userId: v.string(),
    date: v.string(),
    status: v.string(),
    note: v.optional(v.string()),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("adherenceLogs")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", args.userId).eq("date", args.date)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        note: args.note,
      });
      return existing._id;
    }
    return await ctx.db.insert("adherenceLogs", args);
  },
});

export const getAdherenceByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("adherenceLogs")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

// ===== PUSH SUBSCRIPTIONS =====

export const savePushSubscription = mutation({
  args: {
    userId: v.string(),
    subscription: v.any(),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { subscription: args.subscription });
      return existing._id;
    }
    return await ctx.db.insert("pushSubscriptions", args);
  },
});

export const deletePushSubscription = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const listActivePushSubscriptions = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("pushSubscriptions").collect();
  },
});
