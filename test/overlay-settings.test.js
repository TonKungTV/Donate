'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class Style {
  constructor() {
    this.props = {};
  }

  setProperty(name, value) {
    this.props[name] = value;
  }
}

class Element {
  constructor(id) {
    this.id = id;
    this.style = new Style();
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.width = 0;
    this.height = 0;
    this.classList = {
      add: (...names) => { this.className = [this.className, ...names].filter(Boolean).join(' '); },
      remove: (...names) => {
        const remove = new Set(names);
        this.className = this.className.split(/\s+/).filter((name) => name && !remove.has(name)).join(' ');
      },
      toggle: (name, enabled) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        if (enabled) names.add(name);
        else names.delete(name);
        this.className = Array.from(names).join(' ');
      },
    };
  }

  append(...children) {
    for (const child of children) {
      if (child && typeof child === 'object') child.parentNode = this;
      this.children.push(child);
    }
  }

  removeChild(child) {
    this.children = this.children.filter((c) => c !== child);
    if (child && typeof child === 'object') child.parentNode = null;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  getContext() {
    return {
      setTransform() {},
      clearRect() {},
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      fillRect() {},
      beginPath() {},
      arc() {},
      fill() {},
    };
  }
}

function loadOverlay() {
  const handlers = {};
  const elements = {
    stage: new Element('stage'),
    flash: new Element('flash'),
    fx: new Element('fx'),
  };
  const documentElement = new Element('html');
  const body = new Element('body');
  const document = {
    documentElement,
    body,
    getElementById: (id) => elements[id] || null,
    createElement: (tag) => new Element(tag),
    createDocumentFragment: () => new Element('fragment'),
    createTextNode: (text) => ({ textContent: text }),
  };

  const context = {
    document,
    window: {
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 1,
      addEventListener() {},
    },
    navigator: { userAgent: 'node-test' },
    location: { search: '' },
    URLSearchParams,
    io: () => ({ on: (event, cb) => { handlers[event] = cb; } }),
    console,
    setTimeout: () => 1,
    clearTimeout() {},
    requestAnimationFrame: () => 1,
    Audio: function Audio() {},
  };
  context.globalThis = context;
  context.window.requestAnimationFrame = context.requestAnimationFrame;

  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'overlay.js'), 'utf8');
  vm.runInNewContext(source, context);
  return { handlers, documentElement };
}

test('overlay uses Control Panel accent colors for every donation tier', () => {
  const { handlers, documentElement } = loadOverlay();

  handlers.settings({
    accentColor: '#112233',
    accentColor2: '#445566',
    textColor: '#abcdef',
    position: 'top',
    duration: 60000,
    soundEnabled: false,
    confettiEnabled: false,
    ttsEnabled: false,
    minTts: 0,
    headlineTemplate: '{name} บริจาค {amount}',
    currency: '฿',
  });
  handlers.donation({ name: 'tester', amount: 250, message: 'hi' });

  assert.equal(documentElement.style.props['--acc1'], '#112233');
  assert.equal(documentElement.style.props['--acc2'], '#445566');
  assert.equal(documentElement.style.props['--txt'], '#abcdef');
});
