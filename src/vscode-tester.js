const defaults = {
  type: [ 'pdf' ],
  convertOnSave: false,
  convertOnSaveExclude: [],
  outputDirectory: '',
  outputDirectoryRelativePathFile: false,
  styles: [],
  stylesRelativePathFile: false,
  includeDefaultStyles: true,
  highlight: true,
  highlightStyle: '',
  breaks: false,
  emoji: true,
  executablePath: '',
  scale: 1,
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-size: 9px; margin-left: 1cm;"> <span class='title'></span></div> <div style="font-size: 9px; margin-left: auto; margin-right: 1cm; "> <span class='date'></span></div>`,
  footerTemplate: `<div style="font-size: 9px; margin: 0 auto;"> <span class='pageNumber'></span> / <span class='totalPages'></span></div>`,
  printBackground: true,
  orientation: 'portrait',
  pageRanges: '',
  format: 'A4',
  width: '',
  height: '',
  margin: {
    top: '1.5cm',
    bottom: '1cm',
    right: '1cm',
    left: '1cm',
  },
  quality: 100,
  clip: {
    x: '',
    y: '',
    width: '',
    height: '',
  },
  omitBackground: false,
  plantumlOpenMarker: '@startuml',
  plantumlCloseMarker: '@enduml',
  plantumlServer: 'http://www.plantuml.com/plantuml',
  StatusbarMessageTimeout: 10000,
  'markdown-it-include': {
    enable: true,
  },
  mermaidServer: 'https://unpkg.com/mermaid/dist/mermaid.min.js'
}

class Window {
  init() {}
  showErrorMessage(message) {}
  showInformationMessage(message) {}
  showWarningMessage(message) {}
  setStatusBarMessage(message) {
    return {
      dispose: () => {},
    }
  }
  withProgress({}, f) {
    return f()
  }
}

class Commands {
  init() {}
  registerCommand(command) {
  }
}

class Workspace {
  constructor() {
    this.init();
  }

  init() {
    this.config = {
      'markdown-pdf-2': defaults,
      'http': {},
    };
  }

  getConfiguration(extension) {
    if (this.config[extension]) {
      return this.config[extension];
    }
    return {};
  }

  useExtension(data) {
    this.config[extensionName] = data;
  }
}

const extensionName = 'markdown-pdf-2';
const window = new Window();
const commands = new Commands();
const workspace = new Workspace();

class Uri {
  constructor(path) {
    this.$mid = 1
    this.fsPath = path
    this.external = `file://${path}`
    this.path = path
    this.scheme = 'file'
  }
  static file(path) {
    return new Uri(path)
  }
  toString() {
    return this.external
  }
}

class Helper {
  setConfig(f) {
    workspace.config[extensionName] = f(workspace.config[extensionName]);
  }

  uri(path) {
    return new Uri(path)
  }
}

module.exports = {
  extensionName,
  window,
  commands,
  workspace,
  helper: new Helper(),
  ProgressLocation: {
    Notification: '',
  },
  env: {
    language: 'ja',
  },
  Uri,
};
