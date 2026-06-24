import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
register(pathToFileURL(join(process.cwd(), 'scripts', 'proof', '_tsloader.mjs')).href);
