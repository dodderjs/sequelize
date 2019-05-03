'use strict';

const _ = require('lodash');
const { logger } = require('./utils/logger');
const Promise = require('./promise');
const debug = logger.debugContext('hooks');

const hookTypes = {
  beforeValidate: { params: 2 },
  afterValidate: { params: 2 },
  validationFailed: { params: 3 },
  beforeCreate: { params: 2 },
  afterCreate: { params: 2 },
  beforeDestroy: { params: 2 },
  afterDestroy: { params: 2 },
  beforeRestore: { params: 2 },
  afterRestore: { params: 2 },
  beforeUpdate: { params: 2 },
  afterUpdate: { params: 2 },
  beforeSave: { params: 2, proxies: ['beforeUpdate', 'beforeCreate'] },
  afterSave: { params: 2, proxies: ['afterUpdate', 'afterCreate'] },
  beforeUpsert: { params: 2 },
  afterUpsert: { params: 2 },
  beforeBulkCreate: { params: 2 },
  afterBulkCreate: { params: 2 },
  beforeBulkDestroy: { params: 1 },
  afterBulkDestroy: { params: 1 },
  beforeBulkRestore: { params: 1 },
  afterBulkRestore: { params: 1 },
  beforeBulkUpdate: { params: 1 },
  afterBulkUpdate: { params: 1 },
  beforeFind: { params: 1 },
  beforeFindAfterExpandIncludeAll: { params: 1 },
  beforeFindAfterOptions: { params: 1 },
  afterFind: { params: 2 },
  beforeCount: { params: 1 },
  beforeDefine: { params: 2, sync: true, noModel: true },
  afterDefine: { params: 1, sync: true, noModel: true },
  beforeInit: { params: 2, sync: true, noModel: true },
  afterInit: { params: 1, sync: true, noModel: true },
  beforeAssociate: { params: 2, sync: true },
  afterAssociate: { params: 2, sync: true },
  beforeConnect: { params: 1, noModel: true },
  afterConnect: { params: 2, noModel: true },
  beforeSync: { params: 1 },
  afterSync: { params: 1 },
  beforeBulkSync: { params: 1, noModel: true },
  afterBulkSync: { params: 1, noModel: true }
};
exports.hooks = hookTypes;


/**
 * get array of current hook and its proxies combined
 *
 * @param {string} hookType any hook type @see {@link hookTypes}
 *
 * @private
 */
const getProxiedHooks = hookType =>
  hookTypes[hookType].proxies
    ? hookTypes[hookType].proxies.concat(hookType)
    : [hookType]
;

function getHooks(hooked, hookType) {
  return (hooked.options.hooks || {})[hookType] || [];
}

const Hooks = {
  /**
   * Process user supplied hooks definition
   *
   * @param {Object} hooks hooks definition
   * @private
   */
  _setupHooks(hooks = {}) {
    this.options.hooks = {};
    _.map(hooks, (hooksArray, hookName) => {
      if (!Array.isArray(hooksArray)) hooksArray = [hooksArray];
      hooksArray.forEach(hookFn => this.addHook(hookName, hookFn));
    });
  },

  runHooks(hooks, ...hookArgs) {
    if (!hooks) throw new Error('runHooks requires at least 1 argument');

    let hookType;

    if (typeof hooks === 'string') {
      hookType = hooks;
      hooks = getHooks(this, hookType);

      if (this.sequelize) {
        hooks = hooks.concat(getHooks(this.sequelize, hookType));
      }
    }

    if (!Array.isArray(hooks)) {
      hooks = [hooks];
    }

    // synchronous hooks
    if (hookTypes[hookType] && hookTypes[hookType].sync) {
      for (let hook of hooks) {
        if (typeof hook === 'object') {
          hook = hook.fn;
        }

        debug(`running hook(sync) ${hookType}`);
        hook.apply(this, hookArgs);
      }
      return;
    }

    // asynchronous hooks (default)
    return Promise.each(hooks, hook => {
      if (typeof hook === 'object') {
        hook = hook.fn;
      }

      debug(`running hook ${hookType}`);
      return hook.apply(this, hookArgs);
    }).return();
  },

  /**
   * Add a hook to the model
   *
   * @param {string}          hookType hook name @see {@link hookTypes}
   * @param {string|Function} [name] Provide a name for the hook function. It can be used to remove the hook later or to order hooks based on some sort of priority system in the future.
   * @param {Function}        fn The hook function
   */
  addHook(hookType, name, fn) {
    if (typeof name === 'function') {
      fn = name;
      name = null;
    }

    if (hookTypes[hookType] && hookTypes[hookType].noModel && this.sequelize) {
      throw new Error(`${hookType} is only applicable on a sequelize instance or static`);
    }
    debug(`adding hook ${hookType}`);
    // check for proxies, add them too
    hookType = getProxiedHooks(hookType);

    hookType.forEach(type => {
      const hooks = getHooks(this, type);
      hooks.push(name ? { name, fn } : fn);
      this.options.hooks[type] = hooks;
    });

    return this;
  },

  /**
   * Remove hook from the model
   *
   * @param {string} hookType @see {@link hookTypes}
   * @param {string|Function} name name of hook or function reference which was attached
   */
  removeHook(hookType, name) {
    const isReference = typeof name === 'function' ? true : false;

    if (!this.hasHook(hookType)) {
      return this;
    }

    debug(`removing hook ${hookType}`);

    // check for proxies, add them too
    hookType = getProxiedHooks(hookType);

    for (const type of hookType) {
      this.options.hooks[type] = this.options.hooks[type].filter(hook => {
        if (isReference && typeof hook === 'function') {
          return hook !== name; // check if same method
        }
        if (!isReference && typeof hook === 'object') {
          return hook.name !== name;
        }
        return true;
      });
    }

    return this;
  },

  /**
   * Check whether the mode has any hooks of this type
   *
   * @param {string} hookType @see {@link hookTypes}
   *
   * @alias hasHooks
   */
  hasHook(hookType) {
    return this.options.hooks[hookType] && !!this.options.hooks[hookType].length;
  }
};
function applyTo(target) {
  _.mixin(target, Hooks);
}
exports.applyTo = applyTo;
