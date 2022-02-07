import { Options, fromgit as fromgitRaw } from './fromgit.js';
import { prompt, readConfiguration, renderTemplate, rmConfiguration } from './template.js';
import { debug } from './utils.js';

export async function fromgit(url: string, dest: string, opts?: Options): Promise<void> {
  const d = fromgitRaw(url, opts);
  d.on('info', event => {
    debug(`fromgit: %s`, event.message.replace('options.', '--'));
  });

  d.on('warn', event => {
    debug(`${event.message.replace('options.', '--')}`);
  });

  await d.clone(dest);

  const templateConfig = await readConfiguration(dest);

  const data = await prompt(templateConfig.variables);

  for (const template of templateConfig.templates || []) {
    renderTemplate(dest, template, data);
  }

  await rmConfiguration(dest);
}
