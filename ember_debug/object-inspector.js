import PortMixin from 'ember-debug/mixins/port-mixin';
import { compareVersion } from 'ember-debug/utils/version';
import { isComputed, isDescriptor, getDescriptorFor } from 'ember-debug/utils/type-check';

const Ember = window.Ember;
const {
  Object: EmberObject, inspect: emberInspect, meta: emberMeta, typeOf: emberTypeOf,
  computed, get, set, guidFor, isNone,
  Mixin, cacheFor, VERSION
} = Ember;
const { oneWay } = computed;

let glimmer;
let metal;
try {
  glimmer = Ember.__loader.require('@glimmer/reference');
  metal = Ember.__loader.require('@ember/-internals/metal');
} catch (e) {
  glimmer = null;
  metal = null;
}

const keys = Object.keys || Ember.keys;

/**
 * workaround to support detection of `[object AsyncFunction]` as a function
 * @param value
 * @returns {string}
 */
function typeOf(value) {
  if (typeof value === 'function') {
    return 'function';
  }
  return emberTypeOf(value);
}

/**
 * Determine the type and get the value of the passed property
 * @param {*} object The parent object we will look for `key` on
 * @param {string} key The key for the property which points to a computed, EmberObject, etc
 * @param {*} computedValue A value that has already been computed with calculateCP
 * @return {{inspect: (string|*), type: string}|{computed: boolean, inspect: string, type: string}|{inspect: string, type: string}}
 */
function inspectValue(object, key, computedValue) {
  let string;
  const value = computedValue;

  if (arguments.length === 3 && computedValue === undefined) {
    return { type: `type-undefined`, inspect: 'undefined' };
  }

  // TODO: this is not very clean. We should refactor calculateCP, etc, rather than passing computedValue
  if (computedValue !== undefined) {
    return { type: `type-${typeOf(value)}`, inspect: inspect(value) };
  }

  if (value instanceof EmberObject) {
    return { type: 'type-ember-object', inspect: value.toString() };
  } else if (isComputed(object, key)) {
    string = '<computed>';
    return { type: 'type-descriptor', inspect: string };
  } else if (isDescriptor(value)) {
    return { type: 'type-descriptor', inspect: value.toString() };
  } else {
    return { type: `type-${typeOf(value)}`, inspect: inspect(value) };
  }
}

function inspect(value) {
  if (typeof value === 'function') {
    return 'function() { ... }';
  } else if (value instanceof EmberObject) {
    return value.toString();
  } else if (typeOf(value) === 'array') {
    if (value.length === 0) {
      return '[]';
    } else if (value.length === 1) {
      return `[ ${inspect(value[0])} ]`;
    } else {
      return `[ ${inspect(value[0])}, ... ]`;
    }
  } else if (value instanceof Error) {
    return `Error: ${value.message}`;
  } else if (value === null) {
    return 'null';
  } else if (typeOf(value) === 'date') {
    return value.toString();
  } else if (typeof value === 'object') {
    // `Ember.inspect` is able to handle this use case,
    // but it is very slow as it loops over all props,
    // so summarize to just first 2 props
    let ret = [];
    let v;
    let count = 0;
    let broken = false;

    for (let key in value) {
      if (!('hasOwnProperty' in value) || value.hasOwnProperty(key)) {
        if (count++ > 1) {
          broken = true;
          break;
        }
        v = value[key];
        if (v === 'toString') {
          continue;
        } // ignore useless items
        if (typeOf(v) === 'function') {
          v = 'function() { ... }';
        }
        if (typeOf(v) === 'array') {
          v = `[Array : ${v.length}]`;
        }
        if (typeOf(v) === 'object') {
          v = '[Object]';
        }
        ret.push(`${key}: ${v}`);
      }
    }
    let suffix = ' }';
    if (broken) {
      suffix = ' ...}';
    }
    return `{ ${ret.join(', ')}${suffix}`;
  } else {
    return emberInspect(value);
  }
}

function isMandatorySetter(descriptor) {
  if (descriptor.set && descriptor.set === Ember.MANDATORY_SETTER_FUNCTION) {
    return true;
  }
  if (descriptor.set && Function.prototype.toString.call(descriptor.set).includes('You attempted to update')) {
    return true;
  }
  return false;
}

function getTagTrackedProps(tag, ownTag, level=0) {
  const props = [];
  // do not include tracked properties from dependencies
  if (!tag || level > 1) {
    return props;
  }
  if (tag.subtag) {
    if (tag.subtag._propertyKey) props.push(tag.subtag._propertyKey);
    props.push(...getTagTrackedProps(tag.subtag, level + 1));
  }
  if (tag.subtags) {
    tag.subtags.forEach((t) => {
      if (t === ownTag) return;
      if (t._propertyKey) props.push(t._propertyKey);
      props.push(...getTagTrackedProps(t, level + 1));
    });
  }
  return props;
}

function getTrackedDependencies(object, property, tag) {
  const proto = Object.getPrototypeOf(object);
  if (!proto) return [];
  const cpDesc = Ember.meta(object).peekDescriptors(property);
  const dependentKeys = [];
  if (cpDesc) {
    dependentKeys.push(...(cpDesc._dependentKeys || []));
  }
  if (metal) {
    const ownTag = metal.tagForProperty(object, property);
    dependentKeys.push(...getTagTrackedProps(tag, ownTag));
  }

  return [...new Set([...dependentKeys])];
}

export default EmberObject.extend(PortMixin, {
  namespace: null,

  adapter: oneWay('namespace.adapter'),

  port: oneWay('namespace.port'),

  currentObject: null,

  updateCurrentObject() {
    if (this.currentObject) {
      const {object, mixinDetails, objectId} = this.currentObject;
      mixinDetails.forEach((mixin, mixinIndex) => {
        mixin.properties.forEach(item => {
          if (item.overridden) {
            return true;
          }
          try {
            let cache = cacheFor(object, item.name);
            if (item.isExpensive && !cache) return true;
            if (item.value.type === 'type-function') return true;

            let value = null;
            let changed = false;
            const values = this.objectPropertyValues[objectId] = this.objectPropertyValues[objectId] || {};
            const tracked = this.trackedTags[objectId] = this.trackedTags[objectId]  || {};

            const desc = Object.getOwnPropertyDescriptor(object, item.name);
            const isSetter = desc && isMandatorySetter(desc);

            if (glimmer && glimmer.validate && metal.track && item.canTrack && !isSetter) {
              let tagInfo = tracked[item.name] || { tag: metal.tagForProperty(object, item.name), revision: 0 };
              if (!tagInfo.tag) return;

              changed = !glimmer.validate(tagInfo.tag, tagInfo.revision);
              if (changed) {
                tagInfo.tag = metal.track(() => {
                  value = get(object, item.name);
                });
                tagInfo.revision = glimmer.value(object, item.name);
              }
              tracked[item.name] = tagInfo;
            } else {
              value = calculateCP(object, item.name, {});
              if (values[item.name] !== value) {
                changed = true;
                values[item.name] = value;
              }
            }

            if (changed) {
              value = inspectValue(object, item.name, value);
              value.isCalculated = true;
              let dependentKeys = null;
              if (tracked[item.name]) {
                dependentKeys = getTrackedDependencies(object, item.name, tracked[item.name].tag);
              }
              this.sendMessage('updateProperty', { objectId, property: item.name, value, mixinIndex, dependentKeys });
            }
          } catch (e) {
            // dont do anything
          }
        });
      });
    }
    // workaround for tests, since calling any runloop inside runloop will prevent any `settled` to be called
    setTimeout(() => Ember.run.next(this, this.updateCurrentObject), 300);
  },

  init() {
    this._super();
    this.set('sentObjects', {});
    Ember.run.next(this, this.updateCurrentObject);
  },

  willDestroy() {
    this._super();
    for (let objectId in this.sentObjects) {
      this.releaseObject(objectId);
    }
  },

  sentObjects: {},

  parentObjects: {},

  objectPropertyValues: {},

  trackedTags: {},

  _errorsFor: computed(function() { return {}; }),

  portNamespace: 'objectInspector',

  messages: {
    digDeeper(message) {
      this.digIntoObject(message.objectId, message.property);
    },
    releaseObject(message) {
      this.releaseObject(message.objectId);
    },
    calculate(message) {
      let value;
      value = this.valueForObjectProperty(message.objectId, message.property, message.mixinIndex);
      if (value) {
        this.sendMessage('updateProperty', value);
        message.isCalculated = true;
      }
      this.sendMessage('updateErrors', {
        objectId: message.objectId,
        errors: errorsToSend(this.get('_errorsFor')[message.objectId])
      });
    },
    saveProperty(message) {
      let value = message.value;
      if (message.dataType && message.dataType === 'date') {
        value = new Date(value);
      }
      this.saveProperty(message.objectId, message.property, value);
    },
    sendToConsole(message) {
      this.sendToConsole(message.objectId, message.property);
    },
    sendControllerToConsole(message) {
      const container = this.get('namespace.owner');
      this.sendValueToConsole(container.lookup(`controller:${message.name}`));
    },
    sendRouteHandlerToConsole(message) {
      const container = this.get('namespace.owner');
      this.sendValueToConsole(container.lookup(`route:${message.name}`));
    },
    sendContainerToConsole() {
      const container = this.get('namespace.owner');
      this.sendValueToConsole(container);
    },
    /**
     * Lookup the router instance, and find the route with the given name
     * @param message The message sent
     * @param {string} messsage.name The name of the route to lookup
     */
    inspectRoute(message) {
      const container = this.get('namespace.owner');
      const router = container.lookup('router:main');
      const routerLib = router._routerMicrolib || router.router;
      // 3.9.0 removed intimate APIs from router
      // https://github.com/emberjs/ember.js/pull/17843
      // https://deprecations.emberjs.com/v3.x/#toc_remove-handler-infos
      if (compareVersion(VERSION, '3.9.0') !== -1) {
        // Ember >= 3.9.0
        this.sendObject(routerLib.getRoute(message.name));
      } else {
        // Ember < 3.9.0
        this.sendObject(routerLib.getHandler(message.name));
      }

    },
    inspectController(message) {
      const container = this.get('namespace.owner');
      this.sendObject(container.lookup(`controller:${message.name}`));
    },
    inspectById(message) {
      const obj = this.sentObjects[message.objectId];
      if (obj) {
        this.sendObject(obj);
      }
    },
    inspectByContainerLookup(message) {
      const container = this.get('namespace.owner');
      this.sendObject(container.lookup(message.name));
    },
    traceErrors(message) {
      let errors = this.get('_errorsFor')[message.objectId];
      toArray(errors).forEach(error => {
        let stack = error.error;
        if (stack && stack.stack) {
          stack = stack.stack;
        } else {
          stack = error;
        }
        this.get('adapter').log(`Object Inspector error for ${error.property}`, stack);
      });
    }
  },

  canSend(val) {
    return val && ((val instanceof EmberObject) || (val instanceof Object) || typeOf(val) === 'array');
  },

  saveProperty(objectId, prop, val) {
    let object = this.sentObjects[objectId];
    set(object, prop, val);
  },

  sendToConsole(objectId, prop) {
    let object = this.sentObjects[objectId];
    let value;

    if (isNone(prop)) {
      value = this.sentObjects[objectId];
    } else {
      value = calculateCP(object, prop, {});
    }

    this.sendValueToConsole(value);
  },

  sendValueToConsole(value) {
    window.$E = value;
    if (value instanceof Error) {
      value = value.stack;
    }
    let args = [value];
    if (value instanceof EmberObject) {
      args.unshift(inspect(value));
    }
    this.get('adapter').log('Ember Inspector ($E): ', ...args);
  },

  digIntoObject(objectId, property) {
    let parentObject = this.sentObjects[objectId];
    let object = calculateCP(parentObject, property, {});

    if (this.canSend(object)) {
      const currentObject = this.currentObject;
      let details = this.mixinsForObject(object);
      this.parentObjects[details.objectId] = currentObject;
      this.sendMessage('updateObject', {
        parentObject: objectId,
        property,
        objectId: details.objectId,
        name: details.objectName,
        details: details.mixins,
        errors: details.errors
      });
    }
  },

  sendObject(object) {
    if (!this.canSend(object)) {
      throw new Error(`Can't inspect ${object}. Only Ember objects and arrays are supported.`);
    }
    let details = this.mixinsForObject(object);
    this.sendMessage('updateObject', {
      objectId: details.objectId,
      name: details.objectName,
      details: details.mixins,
      errors: details.errors
    });
  },


  retainObject(object) {
    let meta = emberMeta(object);
    let guid = guidFor(object);

    meta._debugReferences = meta._debugReferences || 0;
    meta._debugReferences++;

    this.sentObjects[guid] = object;

    if (meta._debugReferences === 1 && object.reopen) {
      // drop object on destruction
      let _oldWillDestroy = object._oldWillDestroy = object.willDestroy;
      let self = this;
      object.reopen({
        willDestroy() {
          self.dropObject(guid);
          return _oldWillDestroy.apply(this, arguments);
        }
      });
    }

    return guid;
  },

  releaseObject(objectId) {
    let object = this.sentObjects[objectId];
    if (!object) {
      return;
    }
    let meta = emberMeta(object);
    let guid = guidFor(object);

    meta._debugReferences--;

    if (meta._debugReferences === 0) {
      this.dropObject(guid);
    }

  },

  dropObject(objectId) {
    let object = this.sentObjects[objectId];
    if (this.parentObjects[objectId]) {
      this.currentObject = this.parentObjects[objectId];
    }
    delete this.parentObjects[objectId];

    if (object && object.reopen) {
      object.reopen({ willDestroy: object._oldWillDestroy });
      delete object._oldWillDestroy;
    }

    delete this.sentObjects[objectId];
    delete this.objectPropertyValues[objectId];
    delete this.trackedTags[objectId];
    if (this.currentObject && this.currentObject.objectId === objectId) {
      this.currentObject = null;
    }

    delete this.get('_errorsFor')[objectId];

    this.sendMessage('droppedObject', { objectId });
  },

  mixinDetailsForObject(object) {
    const mixins = [];
    const proto = Object.getPrototypeOf(object);
    if (proto && !proto.hasOwnProperty('hasOwnProperty')) {
      mixins.push(...this.mixinDetailsForObject(proto));
    }
    if (object instanceof Ember.ObjectProxy && object.content) {
      mixins.push(...this.mixinDetailsForObject(object.content));
    }
    if (object instanceof Ember.ArrayProxy && object.content) {
      mixins.push(...this.mixinDetailsForObject(object.content.toArray()));
    }
    // eslint-disable-next-line ember/no-new-mixins
    const emberMixins = Mixin.mixins(object);

    const getName = function() {
      // dont use mixin toString for object name
      const mixinsToString = [];
      emberMixins.forEach((m) => {
        const found = (m.mixins || []).map(mix => mix.properties && mix.properties.toString).filter(toString => !!toString);
        mixinsToString.push(...found);
      });
      const isValidToString = function(obj) {
        if (!obj.hasOwnProperty('toString') || obj.hasOwnProperty('hasOwnProperty')) {
          return false;
        }
        return !mixinsToString.includes(obj.toString);
      };
      let name = object.constructor.name;
      if (isValidToString(object)) {
        const n = object.toString();
        if (!n.startsWith('<')) return n;
      }
      if (isValidToString(object.constructor)) {
        const n = object.constructor.toString();
        if (!n.startsWith('<')) return n;
      }
      if (isValidToString(proto)) {
        const n = proto.toString();
        if (!n.startsWith('<')) return n;
      }
      if (name === 'Class' || name.startsWith('_') || name.length === 1) {
        name = object.toString();
      }
      return name;
    };

    const mixin = {
      properties: {},
      id: guidFor(object),
      name: getName(object),
    };

    mixin.properties = Object.getOwnPropertyDescriptors(object);
    delete mixin.properties.constructor;

    Ember.meta(object).forEachDescriptors((name, desc) => {
      mixin.properties[name] = desc;
    });

    Object.keys(mixin.properties).forEach(k => {
      if (typeof mixin.properties[k].value === 'function') {
        return;
      }
      mixin.properties[k].isDescriptor = true;
    });

    // insert ember mixins
    emberMixins.reverse().forEach((mixin) => {
      let name = (mixin[Ember.NAME_KEY] || mixin.ownerConstructor || '').toString();

      if (typeof mixin.toString === 'function') {
        try {
          name = mixin.toString();
          if (name === '(unknown)') {
            name = '';
          }
        } catch(e) {
          name = '(Unable to convert Object to string)';
        }
      }

      if (!name && get(mixin, 'mixins.0.properties') && mixin.mixins[0].properties.hasOwnProperty('toString')) {
        try {
          name = mixin.mixins[0].properties.toString();
        } catch (e) {
          // skip
        }
      }

      if (!name) {
        name = 'Unknown mixin';
      }

      const mix = {
        properties: propertiesForMixin(mixin),
        name: name,
        isEmberMixin: true,
        id: guidFor(mixin)
      };
      if (!mixins.find(m => m.id === mix.id)) {
        mixins.push(mix);
      }
    });

    // Clean the properties, removing private props and bindings, etc
    const mixinProperties = [];
    addProperties(mixinProperties, mixin.properties);
    mixin.properties = mixinProperties;
    mixin.isEmberExtended = object.hasOwnProperty('_super');
    mixin.isEmberObject = object.constructor === EmberObject.prototype.constructor;

    // skip merged mixin class (the class which represents A.extend(x, y))
    if (object.hasOwnProperty('constructor') && object.constructor.PrototypeMixin && object.constructor.PrototypeMixin.mixins) {
      return mixins;
    }

    mixins.push(mixin);
    return mixins;
  },

  mixinsForObject(object) {
    // eslint-disable-next-line ember/no-new-mixins
    let mixinDetails = [];

    let objectMixins = this.mixinDetailsForObject(object).reverse();
    // merge first 2 into own properties, if its not created directly from EmberObject.create(...)
    if (objectMixins.length > 1 && !objectMixins[1].isEmberObject) {
      const allProperties = Ember.A(objectMixins[0].properties.concat(...objectMixins[1].properties));
      objectMixins[0].properties = allProperties.uniqBy('name').toArray();
      objectMixins.splice(1, 1);
    }

    mixinDetails.push(...objectMixins);
    const objectName = mixinDetails[0].name;
    mixinDetails[0].name = 'Own Properties';
    mixinDetails[0].expand = true;

    fixMandatorySetters(mixinDetails);
    applyMixinOverrides(mixinDetails);

    let propertyInfo = null;
    let debugInfo = getDebugInfo(object);
    if (debugInfo) {
      propertyInfo = getDebugInfo(object).propertyInfo;
      mixinDetails = customizeProperties(mixinDetails, propertyInfo);
    }

    let expensiveProperties = null;
    if (propertyInfo) {
      expensiveProperties = propertyInfo.expensiveProperties;
    }

    let objectId = this.retainObject(object);

    let errorsForObject = this.get('_errorsFor')[objectId] = {};
    const tracked = this.trackedTags[objectId] = this.trackedTags[objectId]  || {};
    calculateCPs(object, mixinDetails, errorsForObject, expensiveProperties, tracked);

    this.currentObject = { object, mixinDetails, objectId };

    let errors = errorsToSend(errorsForObject);
    return { objectName, objectId, mixins: mixinDetails, errors };
  },

  valueForObjectProperty(objectId, property, mixinIndex) {
    let object = this.sentObjects[objectId], value;

    if (object.isDestroying) {
      value = '<DESTROYED>';
    } else {
      value = calculateCP(object, property, this.get('_errorsFor')[objectId]);
    }

    if (!value || !(value instanceof CalculateCPError)) {
      value = inspectValue(object, property, value);
      value.isCalculated = true;


      return { objectId, property, value, mixinIndex };
    }
  },

  inspect,
  inspectValue
});


function propertiesForMixin(mixin) {
  let properties = [];

  if (mixin.mixins) {
    mixin.mixins.forEach(mixin => {
      if (mixin.properties) {
        addProperties(properties, mixin.properties);
      }
    });
  }

  return properties;
}

function addProperties(properties, hash) {
  for (let prop in hash) {
    if (!hash.hasOwnProperty(prop)) {
      continue;
    }
    if (prop.charAt(0) === '_') {
      continue;
    }

    // remove `fooBinding` type props
    if (prop.match(/Binding$/)) {
      continue;
    }

    // when mandatory setter is removed, an `undefined` value may be set
    const desc = getDescriptorFor(hash, prop) || Object.getOwnPropertyDescriptor(hash, prop);
    if (!desc) continue;
    if (hash[prop] === undefined && desc.value === undefined && !desc.get && !desc._getter) {
      continue;
    }

    let options = { isMandatorySetter: isMandatorySetter(desc) };

    if (typeof hash[prop] === 'object' && hash[prop] !== null) {
      options.isService = !('type' in hash[prop]) && typeof hash[prop].unknownProperty === 'function' ?
        get(hash[prop], 'type') === 'service' :
        hash[prop].type === 'service';


      if (!options.isService) {
        if (hash[prop].constructor) {
          options.isService = hash[prop].constructor.isServiceFactory;
        }
      }

      if (!options.isService) {
        options.isService = desc.value instanceof Ember.Service;
      }

      if (!options.isService) {
        options.isService = desc._getter && desc._getter.name === 'getInjection';
      }
    }
    if (options.isService) {
      replaceProperty(properties, prop, inspectValue(hash, prop), options);
      continue;
    }

    if (isComputed(hash, prop)) {
      options.isComputed = true;
      options.dependentKeys = (desc._dependentKeys || []).map((key) => key.toString());

      if (typeof desc.get === 'function') {
        options.code = Function.prototype.toString.call(desc.get);
      }
      if (typeof desc._getter === 'function') {
        options.isCalculated = true;
        options.code = Function.prototype.toString.call(desc._getter);
      }
      if (!options.code) {
        options.code = '';
      }

      options.readOnly = desc._readOnly;
      options.auto = desc._auto;
      options.canTrack = options.code !== '';
    }

    if (desc.get) {
      options.isTracked = Function.prototype.toString.call(desc.get).includes('CURRENT_TRACKER');
      if (options.isTracked) {
        options.code = '';
      }
      options.isGetter = true;
      options.canTrack = true;
      if (!desc.set) {
        options.readOnly = true;
      }
    }
    if (desc.hasOwnProperty('value') || options.isMandatorySetter) {
      delete options.isGetter;
      delete options.isTracked;
      options.isProperty = true;
      options.canTrack = false;
    }
    replaceProperty(properties, prop, inspectValue(hash, prop), options);
  }
}

function replaceProperty(properties, name, value, options) {
  let found;

  let i, l;
  for (i = 0, l = properties.length; i < l; i++) {
    if (properties[i].name === name) {
      found = i;
      break;
    }
  }

  if (found) {
    properties.splice(i, 1);
  }

  let prop = { name, value };
  prop.isMandatorySetter = options.isMandatorySetter;
  prop.readOnly = options.readOnly;
  prop.auto = options.auto;
  prop.canTrack = options.canTrack;
  prop.isComputed = options.isComputed;
  prop.isProperty = options.isProperty;
  prop.isTracked = options.isTracked;
  prop.isGetter = options.isGetter;
  prop.dependentKeys = options.dependentKeys || [];
  let hasServiceFootprint = prop.value && typeof prop.value.inspect === 'string' ? prop.value.inspect.includes('@service:') : false;
  prop.isService = options.isService || hasServiceFootprint;
  prop.code = options.code;
  properties.push(prop);
}

function fixMandatorySetters(mixinDetails) {
  let seen = {};
  let propertiesToRemove = [];

  mixinDetails.forEach((detail, detailIdx) => {
    detail.properties.forEach(property => {
      if (property.isMandatorySetter) {
        seen[property.name] = {
          name: property.name,
          value: property.value.inspect,
          detailIdx,
          property
        };
      } else if (seen.hasOwnProperty(property.name) && seen[property.name]) {
        propertiesToRemove.push(seen[property.name]);
        delete seen[property.name];
      }
    });
  });

  propertiesToRemove.forEach(prop => {
    let detail = mixinDetails[prop.detailIdx];
    let index = detail.properties.indexOf(prop.property);
    if (index !== -1) {
      detail.properties.splice(index, 1);
    }
  });

}

function applyMixinOverrides(mixinDetails) {
  let seen = {};
  mixinDetails.forEach(detail => {
    detail.properties.forEach(property => {
      if (Object.prototype.hasOwnProperty(property.name)) {
        return;
      }

      if (seen[property.name]) {
        property.overridden = seen[property.name];
        delete property.value.isCalculated;
      }

      seen[property.name] = detail.name;

    });
  });
}

function calculateCPs(object, mixinDetails, errorsForObject, expensiveProperties, tracked) {
  expensiveProperties = expensiveProperties || [];
  mixinDetails.forEach(mixin => {
    mixin.properties.forEach(item => {
      if (item.overridden) {
        return true;
      }
      if (!item.value.isCalculated) {
        let cache = cacheFor(object, item.name);
        item.isExpensive = expensiveProperties.indexOf(item.name) >= 0;
        if (cache !== undefined || !item.isExpensive) {
          let value;
          if (item.canTrack && metal && metal.track) {
            const tagInfo = tracked[item.name] = {};
            tagInfo.tag = metal.track(() => {
              value = calculateCP(object, item.name, errorsForObject);
            });
            if (tagInfo.tag === metal.tagForProperty(object, item.name)) {
              if (!item.isComputed && !item.isService) {
                item.code = '';
                item.isTracked = true;
              }
            }
            tagInfo.revision = glimmer.value(object, item.name);
            item.dependentKeys = getTrackedDependencies(object, item.name, tagInfo.tag);
          } else {
           value = calculateCP(object, item.name, errorsForObject);
          }
          if (!value || !(value instanceof CalculateCPError)) {
            item.value = inspectValue(object, item.name, value);
            item.value.isCalculated = true;
            if (item.value.type === 'type-function') {
              item.code = '';
            }
          }
        }
      }
    });
  });
}

/**
 Customizes an object's properties
 based on the property `propertyInfo` of
 the object's `_debugInfo` method.

 Possible options:
 - `groups` An array of groups that contains the properties for each group
 For example:
 ```javascript
 groups: [
 { name: 'Attributes', properties: ['firstName', 'lastName'] },
 { name: 'Belongs To', properties: ['country'] }
 ]
 ```
 - `includeOtherProperties` Boolean,
 - `true` to include other non-listed properties,
 - `false` to only include given properties
 - `skipProperties` Array containing list of properties *not* to include
 - `skipMixins` Array containing list of mixins *not* to include
 - `expensiveProperties` An array of computed properties that are too expensive.
 Adding a property to this array makes sure the CP is not calculated automatically.

 Example:
 ```javascript
 {
   propertyInfo: {
     includeOtherProperties: true,
     skipProperties: ['toString', 'send', 'withTransaction'],
     skipMixins: [ 'Ember.Evented'],
     calculate: ['firstName', 'lastName'],
     groups: [
       {
         name: 'Attributes',
         properties: [ 'id', 'firstName', 'lastName' ],
         expand: true // open by default
       },
       {
         name: 'Belongs To',
         properties: [ 'maritalStatus', 'avatar' ],
         expand: true
       },
       {
         name: 'Has Many',
         properties: [ 'phoneNumbers' ],
         expand: true
       },
       {
         name: 'Flags',
         properties: ['isLoaded', 'isLoading', 'isNew', 'isDirty']
       }
     ]
   }
 }
 ```
 */
function customizeProperties(mixinDetails, propertyInfo) {
  let newMixinDetails = [];
  let neededProperties = {};
  let groups = propertyInfo.groups || [];
  let skipProperties = propertyInfo.skipProperties || [];
  let skipMixins = propertyInfo.skipMixins || [];

  if (groups.length) {
    mixinDetails[0].expand = false;
  }

  groups.forEach(group => {
    group.properties.forEach(prop => {
      neededProperties[prop] = true;
    });
  });

  mixinDetails.forEach(mixin => {
    let newProperties = [];
    mixin.properties.forEach(item => {
      if (skipProperties.indexOf(item.name) !== -1) {
        return true;
      }

      if (!item.overridden && neededProperties.hasOwnProperty(item.name) && neededProperties[item.name]) {
        neededProperties[item.name] = item;
      } else {
        newProperties.push(item);
      }
    });
    mixin.properties = newProperties;
    if (mixin.properties.length === 0 && mixin.name.toLowerCase().includes('unknown')) {
      // nothing useful for this mixin
      return;
    }
    if (skipMixins.indexOf(mixin.name) === -1) {
      newMixinDetails.push(mixin);
    }
  });

  groups.slice().reverse().forEach(group => {
    let newMixin = { name: group.name, expand: group.expand, properties: [] };
    group.properties.forEach(function(prop) {
      // make sure it's not `true` which means property wasn't found
      if (neededProperties[prop] !== true) {
        newMixin.properties.push(neededProperties[prop]);
      }
    });
    newMixinDetails.unshift(newMixin);
  });

  return newMixinDetails;
}

function getDebugInfo(object) {
  let debugInfo = null;
  let objectDebugInfo = get(object, '_debugInfo');
  if (object instanceof Ember.ObjectProxy) {
    if (!object.content) {
      objectDebugInfo = null;
    }
    if (object.content) {
      object = object.content;
    }
  }
  if (objectDebugInfo && typeof objectDebugInfo === 'function') {
    // We have to bind to object here to make sure the `this` context is correct inside _debugInfo when we call it
    debugInfo = objectDebugInfo.bind(object)();
  }
  debugInfo = debugInfo || {};
  let propertyInfo = debugInfo.propertyInfo || (debugInfo.propertyInfo = {});
  let skipProperties = propertyInfo.skipProperties = propertyInfo.skipProperties || (propertyInfo.skipProperties = []);

  skipProperties.push('isDestroyed', 'isDestroying', 'container');
  // 'currentState' and 'state' are un-observable private properties.
  // The rest are skipped to reduce noise in the inspector.
  if (Ember.Component && object instanceof Ember.Component) {
    skipProperties.push(
      'currentState',
      'state',
      'buffer',
      'outletSource',
      'lengthBeforeRender',
      'lengthAfterRender',
      'template',
      'layout',
      'templateData',
      'domManager',
      'states',
      'element',
      'targetObject'
    );
  }
  return debugInfo;
}


function toArray(errors) {
  return keys(errors).map(key => errors[key]);
}

function calculateCP(object, property, errorsForObject) {
  delete errorsForObject[property];
  try {
    if (object instanceof Ember.ArrayProxy && property == parseInt(property)) {
      return object.objectAt(property);
    }
    return get(object, property);
  } catch(error) {
    errorsForObject[property] = { property, error };
    return new CalculateCPError();
  }
}

function CalculateCPError() {}

function errorsToSend(errors) {
  return toArray(errors).map(error => ({ property: error.property }));
}
