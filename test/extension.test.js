const assert = require('assert');
const fs = require('fs');
const before = require('mocha').before;
const rewire = require('rewire');
const { helper } = require('../src/vscode-tester');
const extension = rewire('../extension');
const vscode = require('../src/vscode-tester');

const makeHtml = extension.__get__('makeHtml');
const converMakrdownToHtml = extension.__get__('convertMarkdownToHtml');


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
})