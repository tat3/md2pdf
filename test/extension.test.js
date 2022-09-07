const assert = require('assert');
const rimraf = require('rimraf')
const fs = require('fs');
const before = require('mocha').before;
const rewire = require('rewire');
const { helper } = require('../src/vscode-tester');
const extension = rewire('../extension');
const vscode = require('../src/vscode-tester');

const makeHtml = extension.__get__('makeHtml');
const converMakrdownToHtml = extension.__get__('convertMarkdownToHtml');
const exportPdf = extension.__get__('exportPdf');


describe('it works', () => {
  it('it works', () => {
    assert.equal(1 + 1, 2);
  });
});

describe('test extension', () => {
  before(() => {
    vscode.commands.init();
    vscode.window.init();
    vscode.workspace.init();
  });

  it('have activate and deactivate function', () => {
    assert.ok(extension.activate);
    assert.ok(extension.deactivate);
  })

  it('register commands in context', () => {
    const ctx = {
      subscriptions: [],
    };
    extension.activate(ctx);
    assert.equal(ctx.subscriptions.length, 6);
  })

  it('convert markdown to html', () => {
    const base = './test/data/basic';
    const md = fs.readFileSync(`${base}.md`, 'utf-8');
    const inner = converMakrdownToHtml(`${base}.md`, 'html', md);
    assert.equal(inner, fs.readFileSync(`${base}_inner.html`, 'utf-8'))

    const html = makeHtml(inner, helper.uri(`${base}.html`));
    assert.equal(html, fs.readFileSync(`${base}.html`, 'utf-8'))
  })

  it('convert html to pdf', async () => {
    const base = process.cwd() + '/test/data/basic';
    const html = fs.readFileSync(`${base}.html`, 'utf-8');

    const pdf_path = `${base}.pdf`
    rimraf.sync(pdf_path);
    const pdf = await exportPdf(html, pdf_path, 'pdf', helper.uri(`${base}.md`));
    assert.ok(fs.existsSync(pdf_path));
  })

})