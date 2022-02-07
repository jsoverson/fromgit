import yaml from 'js-yaml';
import { promises as fs } from 'fs';
import path from 'path';
import ejs from 'ejs';
import prompts from 'prompts';
import { debug } from './utils.js';

interface Prompt {
  name: string;
  description: string;
  remove?: string[];
  templates?: string[];
  rename: Record<string, string>;
  variables: PromptVariables[];
}

interface PromptVariables {
  type: 'text' | 'number';
  name: string;
  message: string;
  initial?: string;
}

export async function readConfiguration(dir: string, file = '.template'): Promise<Prompt> {
  const filePath = path.join(dir, file);
  const templateSource = await fs.readFile(filePath, 'utf-8');
  const template = yaml.load(templateSource) as Prompt;
  template.variables.forEach(v => {
    v.type ||= 'text';
    v.initial ||= process.env[`FROMGIT_${v.name?.toUpperCase()}`];
    debug('%o initial: %o (env: %o)', v.name, v.initial, `FROMGIT_${v.name?.toUpperCase()}`);
  });
  return template;
}

export async function rmConfiguration(dir: string, file = '.template'): Promise<void> {
  const filePath = path.join(dir, file);
  await fs.rm(filePath);
}

export async function renderTemplate(dir: string, file: string, data: Record<string, unknown>): Promise<void> {
  const filePath = path.join(dir, file);
  const templateSource = await fs.readFile(filePath, 'utf-8');
  console.log(templateSource);
  const output = ejs.render(templateSource, data);
  console.log(output);
  await fs.writeFile(filePath, output);
}

export async function renameFiles(dir: string, files: Record<string, string>): Promise<void> {
  for (const [from, to] of Object.entries(files)) {
    await fs.rename(path.join(dir, from), path.join(dir, to));
  }
}

export async function prompt(variables: PromptVariables[]): Promise<Record<string, unknown>> {
  return prompts(variables);
}
