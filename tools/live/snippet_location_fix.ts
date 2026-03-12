// tools/live/snippet_location_fix.ts — Snippet location analysis scaffold
// NOTE: This is a scaffold for the coco snippet bug.
// OAuth must be completed first before this executes against a live store.
// Never throws.

// ── Types ────────────────────────────────────────────────────────────────────

export interface SnippetLocationCheck {
  site_id: string;
  domain: string;
  snippet_name: string;
  render_tag: string;
  expected_location: 'before_closing_body' | 'after_opening_body' | 'before_closing_head';
  actual_location?: string;
  location_correct: boolean;
  theme_file: string;
  line_number?: number;
  recommended_fix?: string;
  checked_at: string;
}

// ── Analyzer ────────────────────────────────────────────────────────────────

export function analyzeSnippetLocation(
  theme_liquid_content: string,
  snippet_name: string,
): SnippetLocationCheck {
  const renderPattern = new RegExp(
    `\\{%-?\\s*render\\s+['"]${escapeRegex(snippet_name)}['"].*?-?%\\}`,
    'g',
  );

  const lines = theme_liquid_content.split('\n');
  let renderTag = '';
  let lineNumber: number | undefined;
  let actualLocation: string | undefined;

  // Find the render tag
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(renderPattern);
    if (match) {
      renderTag = match[0];
      lineNumber = i + 1;
      break;
    }
  }

  if (!renderTag) {
    return {
      site_id: '',
      domain: '',
      snippet_name,
      render_tag: '',
      expected_location: 'before_closing_body',
      actual_location: 'not_found',
      location_correct: false,
      theme_file: 'layout/theme.liquid',
      checked_at: new Date().toISOString(),
      recommended_fix: `Add {% render '${snippet_name}' %} directly before </body> tag in layout/theme.liquid`,
    };
  }

  // Determine actual location relative to </body> and </head>
  const closingBodyLine = findLineIndex(lines, '</body>');
  const closingHeadLine = findLineIndex(lines, '</head>');
  const openingHeadLine = findLineIndex(lines, '<head');
  const renderLine = (lineNumber ?? 1) - 1;

  // Check if inside <head>...</head>
  if (closingHeadLine !== -1 && openingHeadLine !== -1 &&
      renderLine > openingHeadLine && renderLine < closingHeadLine) {
    actualLocation = 'before_closing_head';
  } else if (closingBodyLine !== -1 && renderLine < closingBodyLine) {
    // Check if it's inside a conditional or section block
    const isInsideConditional = isWrappedInBlock(lines, renderLine);
    // Check if there are conditional sections between render and </body>
    const between = lines.slice(renderLine + 1, closingBodyLine);
    const hasConditionalAfter = between.some(
      (l) => l.match(/\{%-?\s*(if|unless|section)\s/) !== null,
    );
    if (isInsideConditional) {
      actualLocation = 'before_body_inside_conditional';
    } else if (hasConditionalAfter) {
      actualLocation = 'before_body_inside_conditional';
    } else {
      actualLocation = 'before_closing_body';
    }
  } else if (closingBodyLine !== -1 && renderLine > closingBodyLine) {
    actualLocation = 'after_closing_body';
  } else {
    actualLocation = 'unknown';
  }

  const locationCorrect = actualLocation === 'before_closing_body';

  const result: SnippetLocationCheck = {
    site_id: '',
    domain: '',
    snippet_name,
    render_tag: renderTag,
    expected_location: 'before_closing_body',
    actual_location: actualLocation,
    location_correct: locationCorrect,
    theme_file: 'layout/theme.liquid',
    line_number: lineNumber,
    checked_at: new Date().toISOString(),
  };

  if (!locationCorrect) {
    result.recommended_fix =
      'Move render tag to directly before </body> tag, outside any conditional section blocks';
  }

  return result;
}

// ── Instruction builder ─────────────────────────────────────────────────────

export function buildSnippetFixInstruction(check: SnippetLocationCheck): string {
  if (check.location_correct) {
    return `No changes needed — ${check.snippet_name} is correctly placed in ${check.theme_file}.`;
  }

  const parts: string[] = [];
  parts.push(`In ${check.theme_file}, find the line:`);
  parts.push(`  ${check.render_tag || `{% render '${check.snippet_name}' %}`}`);
  parts.push(`Move it to immediately before </body>.`);
  if (check.line_number) {
    parts.push(`Remove it from its current location at line ${check.line_number}.`);
  }
  parts.push(
    `The tag must not be inside any {%- if ... -%} or {%- section ... -%} block.`,
  );

  return parts.join('\n');
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isWrappedInBlock(lines: string[], targetLine: number): boolean {
  // Walk backwards from targetLine to find unclosed if/unless/section blocks
  let depth = 0;
  for (let i = targetLine - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.match(/\{%-?\s*end(if|unless)\s*-?%\}/)) depth++;
    if (line.match(/\{%-?\s*(if|unless)\s/)) {
      if (depth > 0) depth--;
      else return true; // unclosed block wrapping our line
    }
  }
  return false;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findLineIndex(lines: string[], needle: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i;
  }
  return -1;
}
