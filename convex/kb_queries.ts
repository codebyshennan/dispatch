import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const insertArticles = internalMutation({
  args: {
    articles: v.array(
      v.object({
        articleId: v.string(),
        title: v.string(),
        url: v.string(),
        body: v.string(),
        updatedAt: v.string(),
        embedding: v.array(v.float64()),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const article of args.articles) {
      const existing = await ctx.db
        .query("kb_articles")
        .withIndex("by_article_id", (q) => q.eq("articleId", article.articleId))
        .unique();
      if (!existing) {
        await ctx.db.insert("kb_articles", article);
      }
    }
  },
});

export const getArticlesByIds = query({
  args: { ids: v.array(v.id("kb_articles")) },
  handler: async (ctx, args) => {
    return Promise.all(args.ids.map((id: Id<"kb_articles">) => ctx.db.get(id)));
  },
});
