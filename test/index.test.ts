import { describe } from 'mocha';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';

import { fromgit } from '../src/index.js';
import { debug } from '../src/utils.js';
import { expect } from 'chai';

async function tempPath(dir: string): Promise<string> {
  const tmpdir = path.join(os.tmpdir(), dir);
  debug(`removing temp dir ${tmpdir}`);
  await fs.remove(tmpdir);
  return tmpdir;
}

describe('fromgit', function () {
  it('should clone the test repo via ssh', async () => {
    const tmp = await tempPath('test1');
    const repo = 'git@github.com:jsoverson/fromgit-test.git';
    process.env.FROMGIT_NAME = 'test-name';
    await fromgit(repo, tmp, { prompt: false });
    const exists = (file: string) => fs.existsSync(path.join(tmp, file));
    const get = async (file: string) => fs.readFile(path.join(tmp, file), 'utf-8');
    expect(exists('test.txt')).to.be.true;
    expect(exists(path.join('src', 'subdir.txt'))).to.be.true;
    const testFile = await get('test.txt');
    expect(testFile).to.equal('ABCDEFG\n');
    const templated = await get('templated.md');
    expect(templated).to.equal('Hello test-name\n');
  });
  it('should clone a branch', async () => {
    const tmp = await tempPath('test2');
    const repo = 'git@github.com:jsoverson/fromgit-test.git';
    process.env.FROMGIT_NAME = 'test-name';
    await fromgit(repo, tmp, { prompt: false, branch: 'test-branch' });
    const exists = (file: string) => fs.existsSync(path.join(tmp, file));
    const get = async (file: string) => fs.readFile(path.join(tmp, file), 'utf-8');
    expect(exists('test.txt')).to.be.false;
    expect(exists(path.join('src', 'subdir.txt'))).to.be.true;
    const templated = await get('templated.md');
    expect(templated).to.equal('Hello test-name\n');
  });
  it('should clone a subdir', async () => {
    const tmp = await tempPath('test3');
    const repo = 'git@github.com:jsoverson/fromgit-test.git';
    process.env.FROMGIT_NAME = 'test-name';
    await fromgit(repo, tmp, { prompt: false, path: 'src' });
    const exists = (file: string) => fs.existsSync(path.join(tmp, file));
    expect(exists('test.txt')).to.be.false;
    expect(exists('subdir.txt')).to.be.true;
  });
});
