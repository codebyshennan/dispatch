/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as executor from "../executor.js";
import type * as executorState from "../executorState.js";
import type * as feedback from "../feedback.js";
import type * as interpreter from "../interpreter.js";
import type * as jobs from "../jobs.js";
import type * as kb from "../kb.js";
import type * as kb_queries from "../kb_queries.js";
import type * as metrics from "../metrics.js";
import type * as migrations from "../migrations.js";
import type * as prompts from "../prompts.js";
import type * as queries from "../queries.js";
import type * as router from "../router.js";
import type * as runbooks from "../runbooks.js";
import type * as seed from "../seed.js";
import type * as threads from "../threads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  executor: typeof executor;
  executorState: typeof executorState;
  feedback: typeof feedback;
  interpreter: typeof interpreter;
  jobs: typeof jobs;
  kb: typeof kb;
  kb_queries: typeof kb_queries;
  metrics: typeof metrics;
  migrations: typeof migrations;
  prompts: typeof prompts;
  queries: typeof queries;
  router: typeof router;
  runbooks: typeof runbooks;
  seed: typeof seed;
  threads: typeof threads;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
