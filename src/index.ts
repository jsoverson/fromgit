import { Options, FromGit } from './fromgit.js';
import { debug } from './utils.js';

export async function fromgit(url: string, dest: string, opts?: Options): Promise<void> {
  const project = new FromGit(url, opts);
  debug('Cloning from %o into %o', url, dest);
  await project.clone(dest);
  debug('Finished', url, dest);
}
