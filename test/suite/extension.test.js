'use strict';

const rimraf = require('rimraf')
const fs = require('fs');

const assert = require('assert');
const before = require('mocha').before;
const path = require('path');

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require('vscode');
// const myExtension = require('.extension');

suite('Extension Test Suite', () => {
    before(async function() {
        this.timeout(60 * 1000);
        const revision = require('puppeteer-core/package.json').puppeteer.chromium_revision;
        const puppeteer = require('puppeteer-core');
        const bf = puppeteer.createBrowserFetcher();
        await bf.download(revision);
        vscode.window.showInformationMessage('Start all tests.');
    });

    test('Mermaid', async function() {
        this.timeout(6000000);
        var textDocument = await vscode.workspace.openTextDocument(path.resolve(__dirname, 'mermaid.md'));
        await vscode.window.showTextDocument(textDocument);
        await vscode.commands.executeCommand('extension.markdown-pdf-2.all');

        const join = (ext) => path.resolve(__dirname, `mermaid.${ext}`);
        assert.ok(fs.existsSync(join('pdf')));
        assert.ok(fs.existsSync(join('jpeg')));
        assert.ok(fs.existsSync(join('png')));
        assert.ok(fs.existsSync(join('html')));

        rimraf.sync(join('pdf'));
        rimraf.sync(join('jpeg'));
        rimraf.sync(join('png'));
        rimraf.sync(join('html'));
    });
});
