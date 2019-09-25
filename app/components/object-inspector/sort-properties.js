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
  sortedProperties: computed('props.length', function () {
    if (this.get('sorted.length') > 100) {
      const props = this.get('sorted').slice(0, 100);
      props.push({ name: '...', value: {
        inspect: 'there are more properties, send to console to see all'
      });
      return props; 
    }
    return props;
  }),

  sorted: sort('sorted', 'sortProperties'),

  props: map('properties', function (p) {
    set(p, 'isFunction', p.value.type === 'type-function');
    if (p.name == parseInt(p.name)) {
      p.name = parseInt(p.name);
    }
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

