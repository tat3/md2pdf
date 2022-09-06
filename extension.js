'use strict';
var vscode = require('vscode');
var path = require('path');
var fs = require('fs');
var url = require('url');
var os = require('os');
var INSTALL_CHECK = false;

const extension = 'markdown-pdf-2';

function activate(context) {
  init();

  var commands = ['settings', 'pdf', 'html', 'png', 'jpeg', 'all']
    .map(type => vscode.commands.registerCommand(
      `extension.${extension}.${type}`,
      async function () { await markdownPdf(type); }
    ));
  commands.forEach(function (command) {
    context.subscriptions.push(command);
  });

  var isConvertOnSave = vscode.workspace.getConfiguration(extension)['convertOnSave'];
  if (isConvertOnSave) {
    var disposable_onsave = vscode.workspace.onDidSaveTextDocument(function () { markdownPdfOnSave(); });
    context.subscriptions.push(disposable_onsave);
  }
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;

async function markdownPdf(option_type) {

  try {

    // check active window
    var editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active Editor!');
      return;
    }

    // check markdown mode
    var mode = editor.document.languageId;
    if (mode != 'markdown') {
      vscode.window.showWarningMessage('It is not a markdown mode!');
      return;
    }

    var uri = editor.document.uri;
    var mdfilename = uri.fsPath;
    var ext = path.extname(mdfilename);
    if (!isExistsPath(mdfilename)) {
      if (editor.document.isUntitled) {
        vscode.window.showWarningMessage('Please save the file!');
        return;
      }
      vscode.window.showWarningMessage('File name does not get!');
      return;
    }

    var types_format = ['html', 'pdf', 'png', 'jpeg'];
    var filename = '';
    var types = [];
    if (types_format.indexOf(option_type) >= 0) {
      types[0] = option_type;
    } else if (option_type === 'settings') {
      var types_tmp = vscode.workspace.getConfiguration(extension)['type'] || 'pdf';
      if (types_tmp && !Array.isArray(types_tmp)) {
          types[0] = types_tmp;
      } else {
        types = vscode.workspace.getConfiguration(extension)['type'] || 'pdf';
      }
    } else if (option_type === 'all') {
      types = types_format;
    } else {
      showErrorMessage('markdownPdf().1 Supported formats: html, pdf, png, jpeg.');
      return;
    }

    // convert and export markdown to pdf, html, png, jpeg
    if (types && Array.isArray(types) && types.length > 0) {
      for (var i = 0; i < types.length; i++) {
        var type = types[i];
        if (types_format.indexOf(type) >= 0) {
          filename = mdfilename.replace(ext, '.' + type);
          var text = editor.document.getText();
          var content = convertMarkdownToHtml(mdfilename, type, text);
          var html = makeHtml(content, uri);
          await exportPdf(html, filename, type, uri);
        } else {
          showErrorMessage('markdownPdf().2 Supported formats: html, pdf, png, jpeg.');
          return;
        }
      }
    } else {
      showErrorMessage('markdownPdf().3 Supported formats: html, pdf, png, jpeg.');
      return;
    }
  } catch (error) {
    showErrorMessage('markdownPdf()', error);
  }
}

function markdownPdfOnSave() {
  try {
    var editor = vscode.window.activeTextEditor;
    var mode = editor.document.languageId;
    if (mode != 'markdown') {
      return;
    }
    if (!isMarkdownPdfOnSaveExclude()) {
      markdownPdf('settings');
    }
  } catch (error) {
    showErrorMessage('markdownPdfOnSave()', error);
  }
}

function isMarkdownPdfOnSaveExclude() {
  try{
    var editor = vscode.window.activeTextEditor;
    var filename = path.basename(editor.document.fileName);
    var patterns = vscode.workspace.getConfiguration(extension)['convertOnSaveExclude'] || '';
    var pattern;
    var i;
    if (patterns && Array.isArray(patterns) && patterns.length > 0) {
      for (i = 0; i < patterns.length; i++) {
        pattern = patterns[i];
        var re = new RegExp(pattern);
        if (re.test(filename)) {
          return true;
        }
      }
    }
    return false;
  } catch (error) {
    showErrorMessage('isMarkdownPdfOnSaveExclude()', error);
  }
}

/*
 * convert markdown to html (markdown-it)
 */
function convertMarkdownToHtml(filename, type, text) {
  var grayMatter = require("gray-matter");
  var matterParts = grayMatter(text);

  try {
    try {
      var statusbarmessage = vscode.window.setStatusBarMessage('$(markdown) Converting (convertMarkdownToHtml) ...');
      var hljs = require('highlight.js');
      var breaks = setBooleanValue(matterParts.data.breaks, vscode.workspace.getConfiguration(extension)['breaks']);
      var md = require('markdown-it')({
        html: true,
        breaks: breaks,
        highlight: function (str, lang) {

          if (lang && lang.match(/\bmermaid\b/i)) {
            return `<div class="mermaid">${str}</div>`;
          }

          if (lang && hljs.getLanguage(lang)) {
            try {
              str = hljs.highlight(str, {
                language: lang,
                ignoreIllegals: true,
              }).value;
            } catch (error) {
              str = md.utils.escapeHtml(str);

              showErrorMessage('markdown-it:highlight', error);
            }
          } else {
            str = md.utils.escapeHtml(str);
          }
          return '<pre class="hljs"><code><div>' + str + '</div></code></pre>';
        }
      });
    } catch (error) {
      statusbarmessage.dispose();
      showErrorMessage('require(\'markdown-it\')', error);
    }

  // convert the img src of the markdown
  var cheerio = require('cheerio');
  var defaultRender = md.renderer.rules.image;
  md.renderer.rules.image = function (tokens, idx, options, env, self) {
    var token = tokens[idx];
    var href = token.attrs[token.attrIndex('src')][1];
    // console.log("original href: " + href);
    if (type === 'html') {
      href = decodeURIComponent(href).replace(/("|')/g, '');
    } else {
      href = convertImgPath(href, filename);
    }
    // console.log("converted href: " + href);
    token.attrs[token.attrIndex('src')][1] = href;
    // // pass token to default renderer.
    return defaultRender(tokens, idx, options, env, self);
  };

  if (type !== 'html') {
    // convert the img src of the html
    md.renderer.rules.html_block = function (tokens, idx) {
      var html = tokens[idx].content;
      var $ = cheerio.load(html);
      $('img').each(function () {
        var src = $(this).attr('src');
        var href = convertImgPath(src, filename);
        $(this).attr('src', href);
      });
      return $.html();
    };
  }

  // checkbox
  md.use(require('markdown-it-checkbox'));

  // emoji
  var emoji_f = setBooleanValue(matterParts.data.emoji, vscode.workspace.getConfiguration(extension)['emoji']);
  if (emoji_f) {
    var emojies_defs = require(path.join(__dirname, 'data', 'emoji.json'));
    try {
      var options = {
        defs: emojies_defs
      };
    } catch (error) {
      statusbarmessage.dispose();
      showErrorMessage('markdown-it-emoji:options', error);
    }
    md.use(require('markdown-it-emoji'), options);
    md.renderer.rules.emoji = function (token, idx) {
      var emoji = token[idx].markup;
      var emojipath = path.join(__dirname, 'data', 'emoji-images', emoji + '.png');
      var emojidata = readFile(emojipath, null).toString('base64');
      if (emojidata) {
        return '<img class="emoji" alt="' + emoji + '" src="data:image/png;base64,' + emojidata + '" />';
      } else {
        return ':' + emoji + ':';
      }
    };
  }

  // toc
  // https://github.com/leff/markdown-it-named-headers
  var options = {
    slugify: Slug
  }
  md.use(require('markdown-it-named-headers'), options);

  // markdown-it-container
  // https://github.com/markdown-it/markdown-it-container
  md.use(require('markdown-it-container'), '', {
    validate: function (name) {
      return name.trim().length;
    },
    render: function (tokens, idx) {
      if (tokens[idx].info.trim() !== '') {
        return `<div class="${tokens[idx].info.trim()}">\n`;
      } else {
        return `</div>\n`;
      }
    }
  });

  // PlantUML
  // https://github.com/gmunguia/markdown-it-plantuml
  var plantumlOptions = {
    openMarker: matterParts.data.plantumlOpenMarker || vscode.workspace.getConfiguration(extension)['plantumlOpenMarker'] || '@startuml',
    closeMarker: matterParts.data.plantumlCloseMarker || vscode.workspace.getConfiguration(extension)['plantumlCloseMarker'] || '@enduml',
    server: vscode.workspace.getConfiguration(extension)['plantumlServer'] || ''
  }
  md.use(require('markdown-it-plantuml'), plantumlOptions);

  // markdown-it-include
  // https://github.com/camelaissani/markdown-it-include
  // the syntax is :[alt-text](relative-path-to-file.md)
  // https://talk.commonmark.org/t/transclusion-or-including-sub-documents-for-reuse/270/13
  if (vscode.workspace.getConfiguration(extension)['markdown-it-include']['enable']) {
    md.use(require("markdown-it-include"), {
      root: path.dirname(filename),
      includeRe: /:\[.+\](\(.+\..+\))/i
    });
  }

  statusbarmessage.dispose();
  return md.render(matterParts.content);

  } catch (error) {
    statusbarmessage.dispose();
    showErrorMessage('convertMarkdownToHtml()', error);
  }
}

/*
 * https://github.com/microsoft/vscode/blob/ca4ceeb87d4ff935c52a7af0671ed9779657e7bd/extensions/markdown-language-features/src/slugify.ts#L26
 */
function Slug(string) {
  try {
    var stg = encodeURI(
      string.trim()
            .toLowerCase()
            .replace(/\s+/g, '-') // Replace whitespace with -
            .replace(/[\]\[\!\'\#\$\%\&\(\)\*\+\,\.\/\:\;\<\=\>\?\@\\\^\_\{\|\}\~\`。，、；：？！…—·ˉ¨‘’“”々～‖∶＂＇｀｜〃〔〕〈〉《》「」『』．〖〗【】（）［］｛｝]/g, '') // Remove known punctuators
            .replace(/^\-+/, '') // Remove leading -
            .replace(/\-+$/, '') // Remove trailing -
    );
    return stg;
  } catch (error) {
    showErrorMessage('Slug()', error);
  }
}

/*
 * make html
 */
function makeHtml(data, uri) {
  try {
    // read styles
    var style = '';
    style += readStyles(uri);

    // get title
    var title = path.basename(uri.fsPath);

    // read template
    var filename = path.join(__dirname, 'template', 'template.html');
    var template = readFile(filename);

    // read mermaid javascripts
    var mermaidServer = vscode.workspace.getConfiguration(extension)['mermaidServer'] || '';
    var mermaid = '<script src=\"' + mermaidServer + '\"></script>';

    // compile template
    var mustache = require('mustache');

    var view = {
      title: title,
      style: style,
      content: data,
      mermaid: mermaid
    };
    return mustache.render(template, view);
  } catch (error) {
    showErrorMessage('makeHtml()', error);
  }
}

/*
 * export a html to a html file
 */
function exportHtml(data, filename) {
  fs.writeFile(filename, data, 'utf-8', function (error) {
    if (error) {
      showErrorMessage('exportHtml()', error);
      return;
    }
  });
}

/*
 * export a html to a pdf file (html-pdf)
 */
function exportPdf(data, filename, type, uri) {

  if (!INSTALL_CHECK) {
    return;
  }
  if (!checkPuppeteerBinary()) {
    showErrorMessage('Chromium or Chrome does not exist! \
      See https://github.com/tat3/vscode-markdown-pdf2#install');
    return;
  }

  var StatusbarMessageTimeout = vscode.workspace.getConfiguration(extension)['StatusbarMessageTimeout'];
  vscode.window.setStatusBarMessage('');
  var exportFilename = getOutputDir(filename, uri);

  return vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: '[Markdown PDF]: Exporting (' + type + ') ...'
    }, async () => {
      try {
        // export html
        if (type == 'html') {
          exportHtml(data, exportFilename);
          vscode.window.setStatusBarMessage('$(markdown) ' + exportFilename, StatusbarMessageTimeout);
          return;
        }

        const puppeteer = require('puppeteer-core');
        // create temporary file
        var f = path.parse(filename);
        var tmpfilename = path.join(f.dir, f.name + '_tmp.html');
        exportHtml(data, tmpfilename);
        var options = {
          executablePath: vscode.workspace.getConfiguration(extension)['executablePath'] || puppeteer.executablePath(),
          args: ['--lang='+vscode.env.language, '--no-sandbox', '--disable-setuid-sandbox']
          // Setting Up Chrome Linux Sandbox
          // https://github.com/puppeteer/puppeteer/blob/master/docs/troubleshooting.md#setting-up-chrome-linux-sandbox
      };
        const browser = await puppeteer.launch(options);
        const page = await browser.newPage();
        await page.goto(vscode.Uri.file(tmpfilename).toString(), { waitUntil: 'networkidle0' });
        // generate pdf
        // https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagepdfoptions
        if (type == 'pdf') {
          // If width or height option is set, it overrides the format option.
          // In order to set the default value of page size to A4, we changed it from the specification of puppeteer.
          var width_option = vscode.workspace.getConfiguration(extension, uri)['width'] || '';
          var height_option = vscode.workspace.getConfiguration(extension, uri)['height'] || '';
          var format_option = '';
          if (!width_option && !height_option) {
            format_option = vscode.workspace.getConfiguration(extension, uri)['format'] || 'A4';
          }
          var landscape_option;
          if (vscode.workspace.getConfiguration(extension, uri)['orientation'] == 'landscape') {
            landscape_option = true;
          } else {
            landscape_option = false;
          }
          var options = {
            path: exportFilename,
            scale: vscode.workspace.getConfiguration(extension, uri)['scale'],
            displayHeaderFooter: vscode.workspace.getConfiguration(extension, uri)['displayHeaderFooter'],
            headerTemplate: vscode.workspace.getConfiguration(extension, uri)['headerTemplate'] || '',
            footerTemplate: vscode.workspace.getConfiguration(extension, uri)['footerTemplate'] || '',
            printBackground: vscode.workspace.getConfiguration(extension, uri)['printBackground'],
            landscape: landscape_option,
            pageRanges: vscode.workspace.getConfiguration(extension, uri)['pageRanges'] || '',
            format: format_option,
            width: vscode.workspace.getConfiguration(extension, uri)['width'] || '',
            height: vscode.workspace.getConfiguration(extension, uri)['height'] || '',
            margin: {
              top: vscode.workspace.getConfiguration(extension, uri)['margin']['top'] || '',
              right: vscode.workspace.getConfiguration(extension, uri)['margin']['right'] || '',
              bottom: vscode.workspace.getConfiguration(extension, uri)['margin']['bottom'] || '',
              left: vscode.workspace.getConfiguration(extension, uri)['margin']['left'] || ''
            }
          }
          await page.pdf(options);
        }

        // generate png and jpeg
        // https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagescreenshotoptions
        if (type == 'png' || type == 'jpeg') {
          // Quality options do not apply to PNG images.
          var quality_option;
          if (type == 'png') {
            quality_option = undefined;
          }
          if (type == 'jpeg') {
            quality_option = vscode.workspace.getConfiguration(extension)['quality'] || 100;
          }

          // screenshot size
          var clip_x_option = vscode.workspace.getConfiguration(extension)['clip']['x'] || null;
          var clip_y_option = vscode.workspace.getConfiguration(extension)['clip']['y'] || null;
          var clip_width_option = vscode.workspace.getConfiguration(extension)['clip']['width'] || null;
          var clip_height_option = vscode.workspace.getConfiguration(extension)['clip']['height'] || null;
          var options;
          if (clip_x_option !== null && clip_y_option !== null && clip_width_option !== null && clip_height_option !== null) {
            options = {
              path: exportFilename,
              quality: quality_option,
              fullPage: false,
              clip: {
                x: clip_x_option,
                y: clip_y_option,
                width: clip_width_option,
                height: clip_height_option,
              },
              omitBackground: vscode.workspace.getConfiguration(extension)['omitBackground'],
            }
          } else {
            options = {
              path: exportFilename,
              quality: quality_option,
              fullPage: true,
              omitBackground: vscode.workspace.getConfiguration(extension)['omitBackground'],
            }
          }
          await page.screenshot(options);
        }

        await browser.close();

        // delete temporary file
        var debug = vscode.workspace.getConfiguration(extension)['debug'] || false;
        if (!debug) {
          if (isExistsPath(tmpfilename)) {
            deleteFile(tmpfilename);
          }
        }

        vscode.window.setStatusBarMessage('$(markdown) ' + exportFilename, StatusbarMessageTimeout);
      } catch (error) {
        showErrorMessage('exportPdf()', error);
      }
    } // async
  ); // vscode.window.withProgress
}

function isExistsPath(path) {
  if (path.length === 0) {
    return false;
  }
  try {
    fs.accessSync(path);
    return true;
  } catch (error) {
    console.warn(error.message);
    return false;
  }
}

function isExistsDir(dirname) {
  if (dirname.length === 0) {
    return false;
  }
  try {
    if (fs.statSync(dirname).isDirectory()) {
      return true;
    } else {
      console.warn('Directory does not exist!') ;
      return false;
    }
  } catch (error) {
    console.warn(error.message);
    return false;
  }
}

function deleteFile (path) {
  var rimraf = require('rimraf')
  rimraf.sync(path);
}

function getOutputDir(filename, resource) {
  try {
    var outputDir;
    if (resource === undefined) {
      return filename;
    }
    var outputDirectory = vscode.workspace.getConfiguration(extension)['outputDirectory'] || '';
    if (outputDirectory.length === 0) {
      return filename;
    }

    // Use a home directory relative path If it starts with ~.
    if (outputDirectory.indexOf('~') === 0) {
      outputDir = outputDirectory.replace(/^~/, os.homedir());
      mkdir(outputDir);
      return path.join(outputDir, path.basename(filename));
    }

    // Use path if it is absolute
    if (path.isAbsolute(outputDirectory)) {
      if (!isExistsDir(outputDirectory)) {
        showErrorMessage(`The output directory specified by the ${extension}.outputDirectory option does not exist.\
          Check the ${extension}.outputDirectory option. ` + outputDirectory);
        return;
      }
      return path.join(outputDirectory, path.basename(filename));
    }

    // Use a workspace relative path if there is a workspace and $extension.outputDirectoryRootPath = workspace
    var outputDirectoryRelativePathFile = vscode.workspace.getConfiguration(extension)['outputDirectoryRelativePathFile'];
    let root = vscode.workspace.getWorkspaceFolder(resource);
    if (outputDirectoryRelativePathFile === false && root) {
      outputDir = path.join(root.uri.fsPath, outputDirectory);
      mkdir(outputDir);
      return path.join(outputDir, path.basename(filename));
    }

    // Otherwise look relative to the markdown file
    outputDir = path.join(path.dirname(resource.fsPath), outputDirectory);
    mkdir(outputDir);
    return path.join(outputDir, path.basename(filename));
  } catch (error) {
    showErrorMessage('getOutputDir()', error);
  }
}

function mkdir(path) {
  if (isExistsDir(path)) {
    return;
  }
  var mkdirp = require('mkdirp');
  return mkdirp.sync(path);
}

function readFile(filename, encode) {
  if (filename.length === 0) {
    return '';
  }
  if (!encode && encode !== null) {
    encode = 'utf-8';
  }
  if (filename.indexOf('file://') === 0) {
    if (process.platform === 'win32') {
      filename = filename.replace(/^file:\/\/\//, '')
                 .replace(/^file:\/\//, '');
    } else {
      filename = filename.replace(/^file:\/\//, '');
    }
  }
  if (isExistsPath(filename)) {
    return fs.readFileSync(filename, encode);
  } else {
    return '';
  }
}

function convertImgPath(src, filename) {
  try {
    var href = decodeURIComponent(src);
    href = href.replace(/("|')/g, '')
          .replace(/\\/g, '/')
          .replace(/#/g, '%23');
    var protocol = url.parse(href).protocol;
    if (protocol === 'file:' && href.indexOf('file:///') !==0) {
      return href.replace(/^file:\/\//, 'file:///');
    } else if (protocol === 'file:') {
      return href;
    } else if (!protocol || path.isAbsolute(href)) {
      href = path.resolve(path.dirname(filename), href).replace(/\\/g, '/')
                                                      .replace(/#/g, '%23');
      if (href.indexOf('//') === 0) {
        return 'file:' + href;
      } else if (href.indexOf('/') === 0) {
        return 'file://' + href;
      } else {
        return 'file:///' + href;
      }
    } else {
      return src;
    }
  } catch (error) {
    showErrorMessage('convertImgPath()', error);
  }
}

function makeCss(filename) {
  try {
    var css = readFile(filename);
    if (css) {
      return '\n<style>\n' + css + '\n</style>\n';
    } else {
      return '';
    }
  } catch (error) {
    showErrorMessage('makeCss()', error);
  }
}

function readStyles(uri) {
  try {
    var includeDefaultStyles;
    var style = '';
    var styles = '';
    var filename = '';
    var i;

    includeDefaultStyles = vscode.workspace.getConfiguration(extension)['includeDefaultStyles'];

    // 1. read the style of the vscode.
    if (includeDefaultStyles) {
      filename = path.join(__dirname, 'styles', 'markdown.css');
      style += makeCss(filename);
    }

    // 2. read the style of the markdown.styles setting.
    if (includeDefaultStyles) {
      styles = vscode.workspace.getConfiguration('markdown')['styles'];
      if (styles && Array.isArray(styles) && styles.length > 0) {
        for (i = 0; i < styles.length; i++) {
          var href = fixHref(uri, styles[i]);
          style += '<link rel=\"stylesheet\" href=\"' + href + '\" type=\"text/css\">';
        }
      }
    }

    // 3. read the style of the highlight.js.
    var highlightStyle = vscode.workspace.getConfiguration(extension)['highlightStyle'] || '';
    var ishighlight = vscode.workspace.getConfiguration(extension)['highlight'];
    if (ishighlight) {
      if (highlightStyle) {
        var css = vscode.workspace.getConfiguration(extension)['highlightStyle'] || 'github.css';
        filename = path.join(__dirname, 'data', 'highlight.js', css);
        style += makeCss(filename);
      } else {
        filename = path.join(__dirname, 'styles', 'tomorrow.css');
        style += makeCss(filename);
      }
    }

    // 4. read the style of the $extension.
    if (includeDefaultStyles) {
      filename = path.join(__dirname, 'styles', 'markdown-pdf.css');
      style += makeCss(filename);
    }

    // 5. read the style of the $extension.styles settings.
    styles = vscode.workspace.getConfiguration(extension)['styles'] || '';
    if (styles && Array.isArray(styles) && styles.length > 0) {
      for (i = 0; i < styles.length; i++) {
        var href = fixHref(uri, styles[i]);
        style += '<link rel=\"stylesheet\" href=\"' + href + '\" type=\"text/css\">';
      }
    }

    return style;
  } catch (error) {
    showErrorMessage('readStyles()', error);
  }
}

/*
 * vscode/extensions/markdown-language-features/src/features/previewContentProvider.ts fixHref()
 * https://github.com/Microsoft/vscode/blob/0c47c04e85bc604288a288422f0a7db69302a323/extensions/markdown-language-features/src/features/previewContentProvider.ts#L95
 *
 * Extension Authoring: Adopting Multi Root Workspace APIs ?E Microsoft/vscode Wiki
 * https://github.com/Microsoft/vscode/wiki/Extension-Authoring:-Adopting-Multi-Root-Workspace-APIs
 */
function fixHref(resource, href) {
  try {
    if (!href) {
      return href;
    }

    // Use href if it is already an URL
    const hrefUri = vscode.Uri.parse(href);
    if (['http', 'https'].indexOf(hrefUri.scheme) >= 0) {
      return hrefUri.toString();
    }

    // Use a home directory relative path If it starts with ^.
    if (href.indexOf('~') === 0) {
      return vscode.Uri.file(href.replace(/^~/, os.homedir())).toString();
    }

    // Use href as file URI if it is absolute
    if (path.isAbsolute(href)) {
      return vscode.Uri.file(href).toString();
    }

    // Use a workspace relative path if there is a workspace and $extension.stylesRelativePathFile is false
    var stylesRelativePathFile = vscode.workspace.getConfiguration(extension)['stylesRelativePathFile'];
    let root = vscode.workspace.getWorkspaceFolder(resource);
    if (stylesRelativePathFile === false && root) {
      return vscode.Uri.file(path.join(root.uri.fsPath, href)).toString();
    }

    // Otherwise look relative to the markdown file
    return vscode.Uri.file(path.join(path.dirname(resource.fsPath), href)).toString();
  } catch (error) {
    showErrorMessage('fixHref()', error);
  }
}

function checkPuppeteerBinary() {
  try {
    // settings.json
    var executablePath = vscode.workspace.getConfiguration(extension)['executablePath'] || ''
    if (isExistsPath(executablePath)) {
      INSTALL_CHECK = true;
      return true;
    }

    // bundled Chromium
    const puppeteer = require('puppeteer-core');
    executablePath = puppeteer.executablePath();
    if (isExistsPath(executablePath)) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    showErrorMessage('checkPuppeteerBinary()', error);
  }
}

/*
 * puppeteer install.js
 * https://github.com/GoogleChrome/puppeteer/blob/master/install.js
 */
function installChromium() {
  try {
    vscode.window.showInformationMessage('[Markdown PDF] Installing Chromium ...');
    var statusbarmessage = vscode.window.setStatusBarMessage('$(markdown) Installing Chromium ...');

    // proxy setting
    setProxy();

    var StatusbarMessageTimeout = vscode.workspace.getConfiguration(extension)['StatusbarMessageTimeout'];
    const puppeteer = require('puppeteer-core');
    const browserFetcher = puppeteer.createBrowserFetcher();
    const revision = require('puppeteer-core/lib/cjs/puppeteer/revisions.js').PUPPETEER_REVISIONS.chromium;
    const revisionInfo = browserFetcher.revisionInfo(revision);

    // download Chromium
    browserFetcher.download(revisionInfo.revision, onProgress)
      .then(() => browserFetcher.localRevisions())
      .then(onSuccess)
      .catch(onError);

    function onSuccess(localRevisions) {
      console.log('Chromium downloaded to ' + revisionInfo.folderPath);
      localRevisions = localRevisions.filter(revision => revision !== revisionInfo.revision);
      // Remove previous chromium revisions.
      const cleanupOldVersions = localRevisions.map(revision => browserFetcher.remove(revision));

      if (checkPuppeteerBinary()) {
        INSTALL_CHECK = true;
        statusbarmessage.dispose();
        vscode.window.setStatusBarMessage('$(markdown) Chromium installation succeeded!', StatusbarMessageTimeout);
        vscode.window.showInformationMessage('[Markdown PDF] Chromium installation succeeded.');
        return Promise.all(cleanupOldVersions);
      }
    }

    function onError(error) {
      statusbarmessage.dispose();
      vscode.window.setStatusBarMessage('$(markdown) ERROR: Failed to download Chromium!', StatusbarMessageTimeout);
      showErrorMessage('Failed to download Chromium! \
        If you are behind a proxy, set the http.proxy option to settings.json and restart Visual Studio Code. \
        See https://github.com/tat3/vscode-markdown-pdf2#install', error);
    }

    function onProgress(downloadedBytes, totalBytes) {
      var progress = parseInt(downloadedBytes / totalBytes * 100);
      vscode.window.setStatusBarMessage('$(markdown) Installing Chromium ' + progress + '%' , StatusbarMessageTimeout);
    }
  } catch (error) {
    showErrorMessage('installChromium()', error);
  }
}

function showErrorMessage(msg, error) {
  vscode.window.showErrorMessage('ERROR: ' + msg);
  console.log('ERROR: ' + msg);
  if (error) {
    vscode.window.showErrorMessage(error.toString());
    console.log(error);
  }
}

function setProxy() {
  var https_proxy = vscode.workspace.getConfiguration('http')['proxy'] || '';
  if (https_proxy) {
    process.env.HTTPS_PROXY = https_proxy;
    process.env.HTTP_PROXY = https_proxy;
  }
}

function setBooleanValue(a, b) {
  if (a === false) {
    return false
  } else {
    return a || b
  }
}

function init() {
  try {
    if (checkPuppeteerBinary()) {
      INSTALL_CHECK = true;
    } else {
      installChromium();
    }
  } catch (error) {
    showErrorMessage('init()', error);
  }
}
