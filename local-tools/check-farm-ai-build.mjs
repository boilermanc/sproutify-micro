import { readFileSync, readdirSync } from 'node:fs';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../', import.meta.url));
const key = parseEnv(readFileSync(path.join(repo, '.env.local'), 'utf8')).OPENAI_API_KEY;
if (!key) throw new Error('Local credential presence check failed.');
const dist = path.resolve(repo, process.argv[2] || 'local-qa/today-growing/ai-review-dist');
const files = readdirSync(dist, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile());
for (const entry of files) {
  const bytes = readFileSync(path.join(entry.parentPath, entry.name));
  if (bytes.includes(Buffer.from(key))) throw new Error('Private credential found in a compiled asset.');
}
console.log(JSON.stringify({ checkedAssets: files.length, credentialExposed: false }));
