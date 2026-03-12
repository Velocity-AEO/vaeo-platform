import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSnippetLocation,
  buildSnippetFixInstruction,
} from './snippet_location_fix.js';

const CORRECT_THEME = `
<html>
<head>
  <title>Test</title>
</head>
<body>
  <main>Content</main>
  {% render 'vaeo-seo' %}
</body>
</html>
`.trim();

const INSIDE_CONDITIONAL = `
<html>
<head>
  <title>Test</title>
</head>
<body>
  <main>Content</main>
  {%- if settings.vaeo_enabled -%}
    {% render 'vaeo-seo' %}
  {%- endif -%}
</body>
</html>
`.trim();

const IN_HEAD = `
<html>
<head>
  {% render 'vaeo-seo' %}
  <title>Test</title>
</head>
<body>
  <main>Content</main>
</body>
</html>
`.trim();

const INSIDE_SECTION = `
<html>
<head></head>
<body>
  {% render 'vaeo-seo' %}
  {%- section 'footer' -%}
</body>
</html>
`.trim();

const MISSING = `
<html>
<head></head>
<body>
  <main>Content</main>
</body>
</html>
`.trim();

describe('analyzeSnippetLocation', () => {
  it('finds correct location before closing body', () => {
    const check = analyzeSnippetLocation(CORRECT_THEME, 'vaeo-seo');
    assert.equal(check.location_correct, true);
    assert.equal(check.actual_location, 'before_closing_body');
  });

  it('detects render tag text', () => {
    const check = analyzeSnippetLocation(CORRECT_THEME, 'vaeo-seo');
    assert.ok(check.render_tag.includes('vaeo-seo'));
  });

  it('sets line_number', () => {
    const check = analyzeSnippetLocation(CORRECT_THEME, 'vaeo-seo');
    assert.ok(check.line_number);
    assert.ok(check.line_number > 0);
  });

  it('detects incorrect location inside conditional', () => {
    const check = analyzeSnippetLocation(INSIDE_CONDITIONAL, 'vaeo-seo');
    assert.equal(check.location_correct, false);
    assert.equal(check.actual_location, 'before_body_inside_conditional');
  });

  it('recommended_fix populated when incorrect', () => {
    const check = analyzeSnippetLocation(INSIDE_CONDITIONAL, 'vaeo-seo');
    assert.ok(check.recommended_fix);
    assert.ok(check.recommended_fix!.includes('</body>'));
  });

  it('no recommended_fix when correct', () => {
    const check = analyzeSnippetLocation(CORRECT_THEME, 'vaeo-seo');
    assert.equal(check.recommended_fix, undefined);
  });

  it('detects location in head', () => {
    const check = analyzeSnippetLocation(IN_HEAD, 'vaeo-seo');
    assert.equal(check.location_correct, false);
    assert.equal(check.actual_location, 'before_closing_head');
  });

  it('location_correct=false when inside section block', () => {
    const check = analyzeSnippetLocation(INSIDE_SECTION, 'vaeo-seo');
    assert.equal(check.location_correct, false);
  });

  it('missing snippet → location_correct=false', () => {
    const check = analyzeSnippetLocation(MISSING, 'vaeo-seo');
    assert.equal(check.location_correct, false);
    assert.equal(check.actual_location, 'not_found');
  });

  it('missing snippet has recommended_fix with add instruction', () => {
    const check = analyzeSnippetLocation(MISSING, 'vaeo-seo');
    assert.ok(check.recommended_fix);
    assert.ok(check.recommended_fix!.includes('Add'));
  });

  it('sets theme_file', () => {
    const check = analyzeSnippetLocation(CORRECT_THEME, 'vaeo-seo');
    assert.equal(check.theme_file, 'layout/theme.liquid');
  });

  it('sets checked_at', () => {
    const check = analyzeSnippetLocation(CORRECT_THEME, 'vaeo-seo');
    assert.ok(!isNaN(Date.parse(check.checked_at)));
  });
});

describe('buildSnippetFixInstruction', () => {
  it('returns no-change message when correct', () => {
    const check = analyzeSnippetLocation(CORRECT_THEME, 'vaeo-seo');
    const instruction = buildSnippetFixInstruction(check);
    assert.ok(instruction.includes('No changes needed'));
  });

  it('includes file path in instruction', () => {
    const check = analyzeSnippetLocation(INSIDE_CONDITIONAL, 'vaeo-seo');
    const instruction = buildSnippetFixInstruction(check);
    assert.ok(instruction.includes('layout/theme.liquid'));
  });

  it('includes line number in instruction', () => {
    const check = analyzeSnippetLocation(INSIDE_CONDITIONAL, 'vaeo-seo');
    const instruction = buildSnippetFixInstruction(check);
    assert.ok(instruction.includes('line'));
    assert.ok(instruction.includes(String(check.line_number)));
  });

  it('includes warning about conditional blocks', () => {
    const check = analyzeSnippetLocation(INSIDE_CONDITIONAL, 'vaeo-seo');
    const instruction = buildSnippetFixInstruction(check);
    assert.ok(instruction.includes('if'));
    assert.ok(instruction.includes('section'));
  });
});
