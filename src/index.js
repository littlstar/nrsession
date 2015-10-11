'use strict';

/**
 * Module dependencies.
 */

import {REPLServer, REPL_MODE_STRICT} from 'repl';
import {writeFileSync as write} from 'fs';
import EventEmitter from 'events';
import mkdir from 'mkdirp';
import Batch from 'batch';
import * as babel from 'babel-core';
import npm from 'npm';
import vm from 'vm';

/**
 * No-op function.
 *
 * @private
 * @function
 * @name noop
 * @return {Undefined}
 */

const noop = _ => void 0;

/**
 * Concat helper.
 *
 * @private
 * @function
 * @name concat
 * @param {Mixed} ...args
 * @return {Array}
 */

const concat = (...args) => Array.prototype.concat.call([], ...args);

/**
 * Map passthrough helper.
 *
 * @private
 * @function
 * @name mapPass
 * @param {Function} fn
 * @return {Function}
 */

const mapPass = fn => _ => (fn(_), _);

/**
 * Ensures a function.
 *
 * @private
 * @function
 * @name ensureFunction
 * @param {Mixed} fn
 * @return {Function}
 */

const ensureFunction = fn => 'function' == typeof fn ? fn : noop;

/**
 * Shallow merge object b into
 * object a and return object a.
 *
 * @private
 * @function
 * @name merge
 * @param {Object} a
 * @param {Object} b
 * @return {Object}
 */

const merge = (a, b) => {
  for (let k in b) a[k] = b[k];
  return a;
};

/**
 * Handles transformed babel code.
 *
 * @private
 * @function
 * @name handleTransform
 * @param {String} code
 * @param {Object} context
 * @param {String} file
 * @param {Function} cb
 */

const handleTransform = (code, context, file, cb) => {
  let err, result, script;
  try {
    script = vm.createScript(code, {
      displayErrors: false,
      filename: file,
    });
  } catch (e) { err = e; }

  if (!err) {
    try {
      result = script.runInContext(context, {displayErrors: false});
    } catch (e) {
      err = e;
      if (err && process.domain) {
        process.domain.emit('error', err);
        process.domain.exit();
        return;
      }
    }
  }

  cb(err, result);
};

/**
 * Dummy configuration object
 * for NPM.
 *
 * @private
 * @const
 * @type {Object}
 * @name DUMMY_CONFIG_OBJECT
 */

const DUMMY_CONFIG_OBJECT = {
  name: "nr-dummy",
  version: "0.0.0",
  private: true,
  description: "",
  main: "index.js",
  scripts: {test: ":"},
  author: "foo",
  license: "MIT"
}

/**
 * Default repl prompt string.
 *
 * @public
 * @const
 * @type {String}
 * @name DEFAULT_PROMPT
 */

export const DEFAULT_PROMPT = 'nr> ';

/**
 * Sandbox directory.
 *
 * @public
 * @const
 * @type {String}
 * @name NR_SANDBOX_DIR
 */

export const NR_SANDBOX_DIR = (
  process.env.NR_SANDBOX_DIR ||
  `${process.env.TMPDIR || '/tmp'}/nr`
);

/**
 * Creates a `nr' session.
 *
 * @public
 * @function
 * @name createSession
 * @param {Object} [opts = {}]
 * @return {NRSession}
 */

export function createSession (opts = {}) {
  return new NRSession(opts);
}

/**
 * NRSession class.
 *
 * @public
 * @class NRSession
 * @extends EventEmitter
 */

export class NRSession extends EventEmitter {

  /**
   * NRSession class constructor.
   *
   * @public
   * @constructor
   * @param {Object} opts
   */

  constructor (opts = {}) {
    super();

    /**
     * Our REPLServer instance
     * created when start() is
     * called.
     *
     * @public
     * @type {REPLServer}
     * @name server
     */

    this.server = null;

    /**
     * Known dependency modules.
     *
     * @public
     * @type {Array}
     * @name modules
     */

    this.modules = [];

    /**
     * Known installed modules.
     *
     * @public
     * @type {Array}
     * @name installed
     */

    this.installed = [];

    /**
     * NRSession and REPLServer
     * configuration options.
     *
     * @public
     * @type {Object}
     * @name options
     */

    this.options = {
      //replMode: REPL_MODE_STRICT,
      prompt: opts.prompt || DEFAULT_PROMPT,
      output: opts.stdout || process.stdout,
      input: opts.stdin || process.stdin,
      eval: opts.eval || function (code, context, file, cb) {
        code = babel.transform(code.slice(0, code.length)).code;
        handleTransform(code, context, file, cb);
      }
    };

    this.on('install', module => {
      if (-1 == this.installed.indexOf(module)) {
        this.installed.push(module);
      }
    });

    // ensure sandbox directory exists
    mkdir(NR_SANDBOX_DIR);
    try {
      write(`${NR_SANDBOX_DIR}/package.json`,
            JSON.stringify(DUMMY_CONFIG_OBJECT));
    } catch (e) {}
  }

  /**
   * Gets the current prompt if available.
   *
   * @public
   * @getter
   * @name prompt
   * @return {String}
   */

  get prompt () {
    return this.server && this.server._prompt || null;
  }

  /**
   * Sets the current prompt if possible.
   *
   * @public
   * @setter
   * @name prompt
   * @type {String}
   */

  set prompt (prompt) {
    if (this.server) {
      this.server.setPrompt(prompt);
    }
  }

  /**
   * Starts a NRSession.
   *
   * @public
   * @method
   * @name start
   * @return {NRSession}
   */

  start () {
    this.stop();

    // initializes server
    const init = _ => {
      this.server = new REPLServer(this.options);
      this.server.on('error', err => this.emit('error', err));
      this.installed
      .filter(Boolean)
      .forEach(module => {
        const scope = this.server.context;
        const require = scope.require.bind(scope);
        scope.require = path => {
          try { return require(path); }
          catch (e) {
            try { return require(`${NR_SANDBOX_DIR}/node_modules/${path}`); }
            catch (e) {}
          }
        };
      });
    };

    if (this.modules.length) {
      this.once('installed', init);
    } else {
      init();
    }
    return this;
  }

  /**
   * Stops an active NRSession.
   *
   * @public
   * @method
   * @name stop
   * @return {NRSession}
   */

  stop () {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.emit('stop');
    }
    return this;
  }

  /**
   * Resets NRSession state.
   *
   * @public
   * @method
   * @name reset
   * @return {NRSession}
   */

  reset () {
    if (this.server) {
      this.server.resetContext();
      this.emit('reset');
    }
    return this;
  }

  /**
   * Requires an NPM module before
   * starting session.
   *
   * @public
   * @method
   * @name require
   * @param {String} ...module
   * @return {NRSession}
   */

  require (...args) {
    concat(...args)
    .map(mapPass(m => this.emit('require', m)))
    .forEach(m => this.modules.push(m));
    return this;
  }

  /**
   * Installs required node modules.
   *
   * @public
   * @method
   * @name install
   * @param {Function} callback
   * @return {NRSession}
   */

  install (callback) {
    const modules = this.modules || [];
    const install = npm.install.bind(npm)
    const length = modules.length;
    if (length) {
      const tasks = new Batch().concurrency(1);
      process.chdir(NR_SANDBOX_DIR);
      tasks.push(done => npm.load(DUMMY_CONFIG_OBJECT, done));
      tasks.push(done => {
        const batch = new Batch();
        for (let module of modules) {
          let i = modules.indexOf(module);
          batch.push(next => {
            install(module, (err, res) => {
              if (err) return next(err);
              else {
                // notify listeners
                this.emit('install', module);
                // clear once installed with no error
                !err && modules.splice(i, i+1);
                // notify caller
                next();
              }
            });
          });
        }

        // callback task queue when batch is done
        batch.end(done);
      });

      tasks.end(err => {
        callback = ensureFunction(callback);
        if (err) this.emit('error', err);
        callback(err);
        this.emit('installed');
      });
    }
    return this;
  }
}
