import { emberSafeRequire } from 'ember-debug/utils/ember/loader';
import * as runloop from './ember/runloop';
import { cacheFor, guidFor } from './ember/object/internals';
import {
  default as Debug,
  inspect,
  registerDeprecationHandler,
} from './ember/debug';
import { subscribe } from './ember/instrumentation';

let Ember;

try {
  Ember = requireModule('ember').default;
} catch {
  Ember = window.Ember;
}

let GlimmerValidator;
let GlimmerRuntime;

let {
  Namespace,
  ActionHandler,
  ControllerMixin,
  CoreObject,
  Application,
  MutableArray,
  MutableEnumerable,
  NativeArray,
  Component,
  Observable,
  Evented,
  PromiseProxyMixin,
  Object: EmberObject,
  VERSION,
  ComputedProperty,
  meta,
  get,
  set,
  TargetActionSupport,
  Views,
  getOwner,
  descriptorForDecorator,
  descriptorForProperty,
  isMandatorySetter,
  _captureRenderTree: captureRenderTree,
  isTesting,
  tagForProperty,
  RSVP,
  GlimmerComponent,
} = Ember || {};

if (!Ember) {
  MutableArray = emberSafeRequire('@ember/array/mutable')?.default;
  Views = emberSafeRequire('@ember/-internals/views');
  Namespace = emberSafeRequire('@ember/application/namespace')?.default;
  MutableEnumerable = emberSafeRequire('@ember/enumerable/mutable')?.default;
  NativeArray = emberSafeRequire('@ember/array')?.NativeArray;
  ControllerMixin = emberSafeRequire('@ember/controller')?.ControllerMixin;
  CoreObject = emberSafeRequire('@ember/object/core')?.default;
  Application = emberSafeRequire('@ember/application')?.default;
  Component = emberSafeRequire('@ember/component')?.default;
  GlimmerComponent = emberSafeRequire('@glimmer/component')?.default;
  Observable = emberSafeRequire('@ember/object/observable')?.default;
  Evented = emberSafeRequire('@ember/object/evented')?.default;
  TargetActionSupport = emberSafeRequire(
    '@ember/-internals/runtime'
  )?.TargetActionSupport;
  PromiseProxyMixin = emberSafeRequire(
    '@ember/object/promise-proxy-mixin'
  )?.default;
  EmberObject = emberSafeRequire('@ember/object')?.default;
  VERSION = emberSafeRequire('ember/version')?.default;
  ComputedProperty = emberSafeRequire(
    '@ember/-internals/metal'
  )?.ComputedProperty;
  (descriptorForDecorator = emberSafeRequire(
    '@ember/-internals/metal'
  )?.descriptorForDecorator),
    (descriptorForProperty = emberSafeRequire(
      '@ember/-internals/metal'
    )?.descriptorForProperty),
    (meta = emberSafeRequire('@ember/-internals/meta')?.meta);
  set = emberSafeRequire('@ember/object')?.set;
  get = emberSafeRequire('@ember/object')?.get;
  getOwner = emberSafeRequire('@ember/application')?.getOwner;
  RSVP = emberSafeRequire('rsvp')?.default;
}

const object = {
  cacheFor,
  guidFor,
  getOwner,
  set,
  get,
  meta,
};

const debug = {
  isComputed: Debug.isComputed,
  isTrackedProperty: null,
  isCachedProperty: null,
  descriptorForProperty,
  descriptorForDecorator,
  isMandatorySetter,
  meta,
  captureRenderTree,
  isTesting,
  inspect,
  registerDeprecationHandler,
  tagForProperty,
  ComputedProperty,
};

const classes = {
  EmberObject,
  MutableArray,
  Namespace,
  MutableEnumerable,
  NativeArray,
  TargetActionSupport,
  ControllerMixin,
  CoreObject,
  Application,
  EmberComponent: Component,
  Observable,
  Evented,
  PromiseProxyMixin,
  ActionHandler,
  GlimmerComponent
};

const instrumentation = {
  subscribe,
};

export {
  runloop,
  object,
  debug,
  classes,
  VERSION,
  instrumentation,
  Views,
  GlimmerValidator,
  GlimmerRuntime,
  RSVP,
};

export default Ember;
