import { Arguments, Argv, CommandModule } from 'yargs';
import { fromgit } from '../index.js';
import { debug } from '../utils.js';
import { prompt, readConfiguration, renderTemplate, rmConfiguration } from '../template.js';

interface Options {
  url: string;
  directory: string;
  ref?: string;
  subdirectory?: string;
}

export const definition: CommandModule<unknown, Options> = {
  command: `$0 <url> <directory> [options]`,
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
        ref: { type: 'string', description: 'Reference or branch to check out' },
        silent: { type: 'boolean', description: 'Enable to disable interactive prompt for project variables' },
        subdirectory: { type: 'string', description: 'Subdirectory to use as the template root' },
      })
      .example(
        `$0 https://github.com/chromaui/intro-storybook-vue-template .`,
        'Clones intro-storybook-vue-template into the current directory',
      );
  },
  async handler(args: Arguments<Options>): Promise<void> {
    debug('Processing clone command');
    const prompt = !args.silent;
    await fromgit(args.url, args.directory, { ref: args.ref, prompt });
  },
};
