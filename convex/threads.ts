import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const createThread = mutation({
  args: { firstMessage: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("threads", {
      messages: [{ role: "user", content: args.firstMessage }],
    });
  },
});

export const appendMessage = mutation({
  args: {
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    kind: v.optional(v.string()),
    jobId: v.optional(v.id("jobs")),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return;
    const msg: {
      role: "user" | "assistant";
      content: string;
      kind?: string;
      jobId?: Id<"jobs">;
    } = { role: args.role, content: args.content };
    if (args.kind !== undefined) msg.kind = args.kind;
    if (args.jobId !== undefined) msg.jobId = args.jobId;
    await ctx.db.patch(args.threadId, {
      messages: [...thread.messages, msg],
    });
  },
});

export const listThreads = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("threads").order("desc").take(50);
  },
});
