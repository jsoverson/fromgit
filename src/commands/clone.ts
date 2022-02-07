import chalk from 'chalk';

import { Arguments, Argv, CommandModule } from 'yargs';
import { fromgit } from '../fromgit.js';
import { debug } from '../utils.js';
import { prompt, readConfiguration, renderTemplate, rmConfiguration } from '../template.js';

interface Options {
  url: string;
  directory: string;
  branch?: string;
  subdirectory?: string;
}

export const definition: CommandModule<unknown, Options> = {
  command: `clone <url> [options]`,
  describe: 'Start a new project from the passed repository',
  builder: (yargs: Argv): Argv<Options> => {
    return yargs
      .positional('url', {
        demandOption: true,
        type: 'string',
        description: 'The git url to clone',
      })
      .positional('directory', {
        demandOption: true,
        type: 'string',
        description: 'The directory to clone into',
      })
      .options({
        branch: { type: 'string', description: 'Operation to call inside the wasm module' },
        subdirectory: { type: 'string', description: 'Operation to call inside the wasm module' },
      })
      .example(
        `clone https://github.com/chromaui/intro-storybook-vue-template .`,
        'Clones intro-storybook-vue-template into the current directory',
      );
  },
  async handler(args: Arguments<Options>): Promise<void> {
    debug('clone');

    const d = fromgit(args.url, { verbose: true, mode: 'git' });
    d.on('info', event => {
      debug(`degit: %s`, event.message.replace('options.', '--'));
    });

    d.on('warn', event => {
      console.error(chalk.magenta(`! ${event.message.replace('options.', '--')}`));
    });

    await d.clone(args.directory);

    const templateConfig = await readConfiguration(args.directory);

    const data = await prompt(templateConfig.variables);

    for (const template of templateConfig.templates || []) {
      renderTemplate(args.directory, template, data);
    }

    await rmConfiguration(args.directory);
  },
};
