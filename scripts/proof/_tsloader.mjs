// Minimal ESM loader for the proof harness: resolves the project's `@/` alias
// and transpiles .ts/.tsx on the fly with the installed `typescript` package,
// so the harness can import the REAL render path + editor component directly.
import ts from 'typescript';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve, join } from 'node:path';

const ROOT = process.cwd();
const TRY = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx', '.json'];

function probe(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of TRY) if (existsSync(base + e)) return base + e;
  // a `.js` specifier in a TS project usually points at a .ts source
  if (/\.jsx?$/.test(base)) {
    const noext = base.replace(/\.jsx?$/, '');
    for (const e of TRY) if (existsSync(noext + e)) return noext + e;
  }
  for (const e of TRY) {
    const p = join(base, 'index' + e);
    if (existsSync(p)) return p;
  }
  return null;
}

// Bare Next specifiers that have no resolvable file outside a Next runtime.
// Stubbed with visually-identical plain elements so components that use them can
// still be snapshotted.
const STUBS = {
  'next/link': 'scripts/proof/_stubs/next-link.tsx',
  'next/navigation': 'scripts/proof/_stubs/next-navigation.ts',
};

export async function resolve(specifier, context, nextResolve) {
  const stub = STUBS[specifier];
  if (stub) {
    return { url: pathToFileURL(pathResolve(ROOT, stub)).href, shortCircuit: true };
  }
  let target = null;
  if (specifier.startsWith('@/')) {
    target = pathResolve(ROOT, specifier.slice(2));
  } else if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    context.parentURL &&
    context.parentURL.startsWith('file:')
  ) {
    target = pathResolve(dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (target) {
    const found = probe(target);
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (/\.(ts|tsx|mts)$/.test(url)) {
    const path = fileURLToPath(url);
    const src = readFileSync(path, 'utf8');
    const out = ts.transpileModule(src, {
      fileName: path,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        verbatimModuleSyntax: false,
      },
    });
    return { format: 'module', source: out.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
