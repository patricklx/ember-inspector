import Component from '@ember/component';
import { sort, map } from '@ember/object/computed';
import { set } from '@ember/object';

export default Component.extend({
  tagName: '',

  /**
   * Sort the properties by name and group them by property type to make them easier to find in the object inspector.
   *
   * @property sortedProperties
   * @type {Array<Object>}
   */
  sortedProperties: sort('props', 'sortProperties'),

  props: map('properties', function (p) {
    set(p, 'isFunction', p.value.type === 'type-function');
    return p;
  }),

  init() {
    this._super(...arguments);

    /**
     * Used by the `sort` computed macro.
     *
     * @property sortProperties
     * @type {Array<String>}
     */
    this.sortProperties = [
      'isFunction',
      'isProperty:desc',
      'isService:desc',
      'isTracked:desc',
      'isComputed:desc',
      'isGetter:desc',
      'name'
    ];
  },
});

