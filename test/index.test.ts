import { describe } from 'mocha';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';

import { fromgit } from '../src/index.js';
import { expect } from 'chai';

async function tempPath(dir: string): Promise<string> {
  const tmpdir = path.join(os.tmpdir(), dir);
  console.log(`removing temp dir ${tmpdir}`);
  await fs.remove(tmpdir);
  return dir;
}

describe('fromgit', function () {
  it('should clone the test repo via ssh', async () => {
    await fs.remove('wapc');
    const tmp = await tempPath('wapc-rust');
    const repo = 'git@github.com:jsoverson/fromgit-test.git';
    process.env.FROMGIT_NAME = 'test-name';
    await fromgit(repo, tmp);
    const exists = (file: string) => fs.existsSync(path.join(tmp, file));
    const get = async (file: string) => fs.readFile(path.join(tmp, file));
    expect(exists('test.txt')).to.be.true;
    expect(exists(path.join('src', 'subdir.txt'))).to.be.true;
    const testFile = await get('test.txt');
    expect(testFile).to.equal('ABCDEFG');
    const templated = await get('templated.md');
    expect(templated).to.equal('Hello test-name\n');
  });
});
