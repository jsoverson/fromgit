import { Options, fromgit as fromgitRaw } from './fromgit.js';
import { debug } from './utils.js';

export async function fromgit(url: string, dest: string, opts?: Options): Promise<void> {
  const d = fromgitRaw(url, opts);
  debug('Cloning from %o into %o', url, dest);
  d.on('info', event => {
    debug(`fromgit: %s`, event.message.replace('options.', '--'));
  });

  d.on('warn', event => {
    debug(`${event.message.replace('options.', '--')}`);
  });

  await d.clone(dest);
  await d.render(dest);

  // await rmConfiguration(dest);
}
