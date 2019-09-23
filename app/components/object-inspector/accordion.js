import { action, computed } from '@ember/object';
import Component from '@ember/component';

export default Component.extend({
  tagName: '',

  _mixin: null,

  isExpanded: undefined,

  mixin: computed({
    get() {
      return this._mixin;
    },
    set(key, value) {
      this.set('_mixin', value);
      if (this.isExpanded === undefined) {
        this.set('isExpanded',  this.get('mixin.expand') && this.get('mixin.properties.length') > 0);
      }
      return value;
    }
  }),

  toggle: action(function () {
    this.toggleProperty('isExpanded');
  }),
});

