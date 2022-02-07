import { Options, fromgit as fromgitRaw } from './fromgit.js';
import { debug } from './utils.js';

export async function fromgit(url: string, dest: string, opts?: Options): Promise<void> {
  const project = fromgitRaw(url, opts);
  debug('Cloning from %o into %o', url, dest);
  await project.clone(dest);
  debug('Finished', url, dest);
}
