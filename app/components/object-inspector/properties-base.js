import Component from '@ember/component';
import { action, computed } from '@ember/object';
import { guidFor } from '@ember/object/internals';

export default Component.extend({
  tagName: '',

  mixins: computed('model.mixins.[]', function () {
    return this.get('model.mixins').map((m) => {
      m._key = guidFor(m);
      return m;
    });
  }),

  sendToConsole: action(function ({ name }) {
    if (name === '...') {
      this.port.send('objectInspector:sendToConsole', {
        objectId: this.model.objectId
      });
      return;
    }
    this.port.send('objectInspector:sendToConsole', {
      objectId: this.model.objectId,
      property: name
    });
  }),

  digDeeper: action(function({ name }) {
    this.port.send('objectInspector:digDeeper', {
      objectId: this.model.objectId,
      property: name
    });
  }),

  saveProperty: action(function(property, value, dataType) {
    this.port.send('objectInspector:saveProperty', {
      objectId: this.model.objectId,
      property,
      value,
      dataType
    });
  }),
});

