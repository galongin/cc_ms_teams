/**
 * Language mapper for Adaptive Card CodeBlock elements.
 *
 * Maps file extensions and markdown fence labels to the language
 * identifiers supported by Teams Adaptive Cards CodeBlock.
 */

// ── Extension → language map ────────────────────────────────────────

const EXTENSION_MAP: Record<string, string> = {
  // TypeScript
  ts: 'TypeScript',
  tsx: 'TypeScript',
  mts: 'TypeScript',
  cts: 'TypeScript',
  // JavaScript
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  // Python
  py: 'Python',
  pyw: 'Python',
  // Rust
  rs: 'Rust',
  // Go
  go: 'Go',
  // Java
  java: 'Java',
  // C
  c: 'C',
  h: 'C',
  // C++
  cpp: 'C++',
  hpp: 'C++',
  cc: 'C++',
  cxx: 'C++',
  // C#
  cs: 'C#',
  // Ruby
  rb: 'Ruby',
  // PHP
  php: 'PHP',
  // Swift
  swift: 'Swift',
  // Kotlin
  kt: 'Kotlin',
  kts: 'Kotlin',
  // Bash
  sh: 'Bash',
  bash: 'Bash',
  zsh: 'Bash',
  // YAML
  yaml: 'YAML',
  yml: 'YAML',
  // JSON
  json: 'JSON',
  jsonc: 'JSON',
  // XML
  xml: 'XML',
  xsl: 'XML',
  xsd: 'XML',
  svg: 'XML',
  // HTML
  html: 'HTML',
  htm: 'HTML',
  // CSS
  css: 'CSS',
  scss: 'CSS',
  less: 'CSS',
  // SQL
  sql: 'SQL',
  // Markdown
  md: 'Markdown',
  mdx: 'Markdown',
  // Docker
  dockerfile: 'Docker',
  // Perl
  pl: 'Perl',
  pm: 'Perl',
  // PowerShell
  ps1: 'PowerShell',
  psm1: 'PowerShell',
  // GraphQL
  graphql: 'GraphQL',
  gql: 'GraphQL',
  // Verilog/VHDL
  v: 'Verilog',
  vhd: 'VHDL',
  vhdl: 'VHDL',
  // Visual Basic
  vb: 'Visual Basic',
  // DOS
  bat: 'DOS',
  cmd: 'DOS',
};

// ── Fence label → language map ──────────────────────────────────────

const FENCE_LABEL_MAP: Record<string, string> = {
  typescript: 'TypeScript',
  ts: 'TypeScript',
  javascript: 'JavaScript',
  js: 'JavaScript',
  python: 'Python',
  py: 'Python',
  rust: 'Rust',
  rs: 'Rust',
  golang: 'Go',
  go: 'Go',
  java: 'Java',
  c: 'C',
  'c++': 'C++',
  cpp: 'C++',
  'c#': 'C#',
  csharp: 'C#',
  ruby: 'Ruby',
  rb: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kotlin: 'Kotlin',
  kt: 'Kotlin',
  bash: 'Bash',
  shell: 'Bash',
  sh: 'Bash',
  zsh: 'Bash',
  yaml: 'YAML',
  yml: 'YAML',
  json: 'JSON',
  jsonc: 'JSON',
  xml: 'XML',
  html: 'HTML',
  css: 'CSS',
  scss: 'CSS',
  less: 'CSS',
  sql: 'SQL',
  markdown: 'Markdown',
  md: 'Markdown',
  docker: 'Docker',
  dockerfile: 'Docker',
  perl: 'Perl',
  powershell: 'PowerShell',
  ps1: 'PowerShell',
  graphql: 'GraphQL',
  plaintext: 'PlainText',
  text: 'PlainText',
  txt: 'PlainText',
};

/**
 * Detect language from a file path by its extension.
 * Returns "PlainText" for unknown extensions.
 */
export function detectLanguage(filePath: string): string {
  // Handle Dockerfile (no extension)
  const basename = filePath.split('/').pop() ?? '';
  if (basename.toLowerCase() === 'dockerfile') {
    return 'Docker';
  }

  const ext = basename.split('.').pop()?.toLowerCase();
  if (!ext) return 'PlainText';
  return EXTENSION_MAP[ext] ?? 'PlainText';
}

/**
 * Normalize a markdown fence label to an Adaptive Cards CodeBlock language.
 * Handles common aliases like "typescript" -> "TypeScript", "python" -> "Python".
 * Returns "PlainText" for unknown labels.
 */
export function normalizeLanguage(lang: string): string {
  if (!lang) return 'PlainText';
  const lower = lang.toLowerCase().trim();
  return FENCE_LABEL_MAP[lower] ?? 'PlainText';
}
