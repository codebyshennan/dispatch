import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { invoke, ClassificationSchema } from '@beacon/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoldenRecord {
  id: string;
  ticket_text: string;
  expected_category: string;
  expected_urgency: string;
  expected_tags: string[];
  notes?: string;
}

interface ClassificationResult {
  category: string;
  sub_category: string;
  urgency: string;
  sentiment: number;
  language: string;
  confidence: number;
  compliance_flags: string[];
  crypto_specific_tags: string[];
}

interface TicketResult {
  id: string;
  passed: boolean;
  expected_category: string;
  actual_category: string;
  expected_urgency: string;
  actual_urgency: string;
  expected_tags: string[];
  actual_tags: string[];
  error?: string;
}

interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  accuracy: string;
}

export interface EvalOutput {
  summary: EvalSummary;
  results: TicketResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');

/**
 * Read a prompt file from prompts/<name>.md, strip YAML frontmatter, return the body text.
 */
function readPrompt(promptName: string): string {
  const promptPath = path.join(WORKSPACE_ROOT, 'prompts', `${promptName}.md`);
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptPath}`);
  }
  const raw = fs.readFileSync(promptPath, 'utf-8');

  // Strip YAML frontmatter (--- ... ---)
  const frontmatterMatch = raw.match(/^---\n[\s\S]*?\n---\n/);
  if (frontmatterMatch) {
    return raw.slice(frontmatterMatch[0].length).trim();
  }
  return raw.trim();
}

/**
 * Read the system prompt from prompts/system/classification.md, strip frontmatter.
 */
function readSystemPrompt(): string {
  return readPrompt('system/classification');
}

/**
 * Stream-parse a JSONL dataset file line by line. Returns an AsyncIterable.
 */
async function* readDatasetLines(datasetPath: string): AsyncIterable<GoldenRecord> {
  const stream = fs.createReadStream(datasetPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    yield JSON.parse(trimmed) as GoldenRecord;
  }
}

/**
 * Determine if a ticket result passes:
 * - category AND urgency must match exactly
 * - tags: at least 1 expected tag must be present in actual_tags
 */
function evaluateMatch(
  record: GoldenRecord,
  classification: ClassificationResult,
): boolean {
  const categoryMatch = classification.category === record.expected_category;
  const urgencyMatch = classification.urgency === record.expected_urgency;

  const allActualTags = [
    ...classification.compliance_flags,
    ...classification.crypto_specific_tags,
  ];
  const tagsMatch =
    record.expected_tags.length === 0 ||
    record.expected_tags.some((tag) => allActualTags.includes(tag));

  return categoryMatch && urgencyMatch && tagsMatch;
}

// ---------------------------------------------------------------------------
// Core eval runner
// ---------------------------------------------------------------------------

export async function runEval(opts: {
  promptName: string;
  datasetName: string;
  threshold: number;
}): Promise<EvalOutput> {
  const { promptName, datasetName, threshold } = opts;

  // 1. Load prompt text
  const promptBody = readPrompt(promptName);
  const systemText = readSystemPrompt();

  // 2. Resolve dataset path
  const datasetPath = path.join(
    WORKSPACE_ROOT,
    'datasets',
    'golden',
    `${datasetName}.jsonl`,
  );
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Dataset file not found: ${datasetPath}`);
  }

  // 3. Process tickets
  let totalCount = 0;
  let passCount = 0;
  const results: TicketResult[] = [];

  for await (const record of readDatasetLines(datasetPath)) {
    totalCount++;

    let ticketResult: TicketResult;

    try {
      // Inject ticket text into prompt
      const userContent = promptBody.replace('{ticket_text}', record.ticket_text);

      const llmResult = await invoke<ClassificationResult>(userContent, {
        provider: 'openrouter',
        model: 'google/gemma-3-27b-it:free',
        system: systemText,
        schema: ClassificationSchema,
        maxTokens: 512,
        temperature: 0,
      });

      const classification = llmResult.data;
      const passed = evaluateMatch(record, classification);

      if (passed) {
        passCount++;
      }

      ticketResult = {
        id: record.id,
        passed,
        expected_category: record.expected_category,
        actual_category: classification.category,
        expected_urgency: record.expected_urgency,
        actual_urgency: classification.urgency,
        expected_tags: record.expected_tags,
        actual_tags: [
          ...classification.compliance_flags,
          ...classification.crypto_specific_tags,
        ],
      };

    } catch (err) {
      // Graceful degradation (INFRA-09): LLM call failure counts as a failed ticket
      const errorMsg = err instanceof Error ? err.message : String(err);
      ticketResult = {
        id: record.id,
        passed: false,
        expected_category: record.expected_category,
        actual_category: '',
        expected_urgency: record.expected_urgency,
        actual_urgency: '',
        expected_tags: record.expected_tags,
        actual_tags: [],
        error: errorMsg,
      };
    }

    results.push(ticketResult);
  }

  // 4. Calculate accuracy
  const failCount = totalCount - passCount;
  const accuracyRaw = totalCount === 0 ? 0 : (passCount / totalCount) * 100;
  const accuracyPct = `${accuracyRaw.toFixed(1)}%`;

  // 5. Build output
  const output: EvalOutput = {
    summary: {
      total: totalCount,
      passed: passCount,
      failed: failCount,
      accuracy: accuracyPct,
    },
    results,
  };

  // 6. Return output (callers handle printing and exit code)
  return output;
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('beacon-eval')
  .description('Run Meridian classification prompt eval against a golden dataset')
  .requiredOption('--prompt <name>', 'Prompt name under prompts/ dir (e.g. classification/v1)')
  .requiredOption('--dataset <name>', 'Dataset name under datasets/golden/ (e.g. classification-v1)')
  .option('--threshold <number>', 'Minimum accuracy % to exit 0 (default: 85)', '85')
  .action(async (options: { prompt: string; dataset: string; threshold: string }) => {
    const threshold = parseFloat(options.threshold);
    if (isNaN(threshold) || threshold < 0 || threshold > 100) {
      process.stderr.write('Error: --threshold must be a number between 0 and 100\n');
      process.exit(2);
    }

    try {
      const output = await runEval({
        promptName: options.prompt,
        datasetName: options.dataset,
        threshold,
      });

      // Print JSON summary to stdout
      process.stdout.write(JSON.stringify(output, null, 2) + '\n');

      // Print fail details to stderr
      const failDetails = output.results
        .filter((r) => !r.passed)
        .map(
          (r) =>
            `[FAIL] ${r.id}: ` +
            `expected_category=${r.expected_category} actual=${r.actual_category} ` +
            `expected_urgency=${r.expected_urgency} actual=${r.actual_urgency}`,
        );

      if (failDetails.length > 0) {
        process.stderr.write('\n--- FAILED TICKETS ---\n');
        for (const detail of failDetails) {
          process.stderr.write(detail + '\n');
        }
      }

      // Exit code based on threshold
      const accuracyRaw = parseFloat(output.summary.accuracy);
      if (accuracyRaw < threshold) {
        process.exit(1);
      }
      process.exit(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Fatal error: ${msg}\n`);
      process.exit(2);
    }
  });

program.parse(process.argv);
