import React from 'react';
import {mountWithTheme} from 'sentry-test/enzyme';

import SavedQueriesStore from 'app/stores/discoverSavedQueriesStore';

import SavedQueryButtonGroup from 'app/views/eventsV2/savedQuery';
import {ALL_VIEWS} from 'app/views/eventsV2/data';
import EventView from 'app/views/eventsV2/eventView';
import * as utils from 'app/views/eventsV2/savedQuery/utils';

const SELECTOR_BUTTON_SAVE_AS = 'ButtonSaveAs';
const SELECTOR_BUTTON_SAVED = 'ButtonSaved';
const SELECTOR_BUTTON_UPDATE = '[data-test-id="discover2-savedquery-button-update"]';
const SELECTOR_BUTTON_DELETE = '[data-test-id="discover2-savedquery-button-delete"]';

function generateWrappedComponent(location, organization, eventView) {
  return mountWithTheme(
    <SavedQueryButtonGroup
      location={location}
      organization={organization}
      eventView={eventView}
    />,
    TestStubs.routerContext()
  );
}

describe('EventsV2 > SaveQueryButtonGroup', function() {
  // Organization + Location does not affect state in this component
  const organization = TestStubs.Organization();
  const location = {
    pathname: '/organization/eventsv2/',
    query: {},
  };

  const errorsQuery = ALL_VIEWS.find(view => view.name === 'Errors');
  const errorsView = EventView.fromEventViewv1(errorsQuery);

  const errorsViewSaved = EventView.fromEventViewv1(errorsQuery);
  errorsViewSaved.id = '1';

  const errorsViewModified = EventView.fromEventViewv1(errorsQuery);
  errorsViewModified.id = '1';
  errorsViewModified.name = 'Modified Name';
  errorsViewModified.fields[0].title = 'Modified Field Name';

  const errorsSavedQuery = errorsViewSaved.toNewQuery();

  SavedQueriesStore.state = {
    isLoading: false,
    hasError: false,
    savedQueries: [errorsSavedQuery],
  };

  describe('building on a new query', () => {
    let mockUtils;
    beforeAll(() => {
      mockUtils = jest
        .spyOn(utils, 'handleCreateQuery')
        .mockImplementation(() => Promise.resolve(errorsSavedQuery));
    });

    afterEach(() => {
      mockUtils.mockClear();
    });

    it('renders the correct set of buttons', () => {
      const wrapper = generateWrappedComponent(location, organization, errorsView);

      const buttonSaveAs = wrapper.find(SELECTOR_BUTTON_SAVE_AS);
      const buttonSaved = wrapper.find(SELECTOR_BUTTON_SAVED);
      const buttonUpdate = wrapper.find(SELECTOR_BUTTON_UPDATE);
      const buttonDelete = wrapper.find(SELECTOR_BUTTON_DELETE);

      expect(buttonSaveAs.exists()).toBe(true);
      expect(buttonSaved.exists()).toBe(false);
      expect(buttonUpdate.exists()).toBe(false);
      expect(buttonDelete.exists()).toBe(false);
    });

    describe('saving the new query', () => {
      it('accepts a well-formed query', async () => {
        const wrapper = generateWrappedComponent(location, organization, errorsView);

        // Click on ButtonSaveAs to open dropdown
        const buttonSaveAs = wrapper.find('DropdownControl').first();
        buttonSaveAs.simulate('click');

        // Fill in the Input
        buttonSaveAs
          .find('ButtonSaveInput')
          .simulate('change', {target: {value: 'My New Query Name'}}); // currentTarget.value does not work
        await tick();

        // Click on Save in the Dropdown
        buttonSaveAs.find('ButtonSaveDropDown Button').simulate('click');

        expect(mockUtils).toHaveBeenCalledWith(
          expect.anything(), // api
          organization,
          expect.objectContaining({
            ...errorsView,
            name: 'My New Query Name',
          }),
          true
        );
      });

      it('rejects if query.name is empty', async () => {
        const wrapper = generateWrappedComponent(location, organization, errorsView);

        // Click on ButtonSaveAs to open dropdown
        const buttonSaveAs = wrapper.find('DropdownControl').first();
        buttonSaveAs.simulate('click');

        // Do not fill in Input
        await tick();

        // Click on Save in the Dropdown
        buttonSaveAs.find('ButtonSaveDropDown Button').simulate('click');

        // Check that EventView has a name
        expect(errorsView.name).toBe('Errors');

        /**
         * This does not work because SavedQueryButtonGroup is wrapped by 2 HOCs
         * and we cannot access the state of the inner component. But it should
         * be empty because we didn't fill in Input. If it has a value, then the
         * test will fail anyway
         */
        // expect(wrapper.state('queryName')).toBe('');

        expect(mockUtils).not.toHaveBeenCalled();
      });
    });
  });

  describe('viewing a saved query', () => {
    let mockUtils;

    beforeEach(() => {
      mockUtils = jest
        .spyOn(utils, 'handleDeleteQuery')
        .mockImplementation(() => Promise.resolve(errorsSavedQuery));
    });

    afterEach(() => {
      mockUtils.mockClear();
    });

    it('renders the correct set of buttons', () => {
      const wrapper = generateWrappedComponent(location, organization, errorsViewSaved);

      const buttonSaveAs = wrapper.find(SELECTOR_BUTTON_SAVE_AS);
      const buttonSaved = wrapper.find(SELECTOR_BUTTON_SAVED);
      const buttonUpdate = wrapper.find(SELECTOR_BUTTON_UPDATE);
      const buttonDelete = wrapper.find(SELECTOR_BUTTON_DELETE);

      expect(buttonSaveAs.exists()).toBe(false);
      expect(buttonSaved.exists()).toBe(true);
      expect(buttonUpdate.exists()).toBe(false);
      expect(buttonDelete.exists()).toBe(true);
    });

    it('deletes the saved query', () => {
      const wrapper = generateWrappedComponent(location, organization, errorsViewSaved);

      const buttonDelete = wrapper.find(SELECTOR_BUTTON_DELETE).first();
      buttonDelete.simulate('click');

      expect(mockUtils).toHaveBeenCalledWith(
        expect.anything(), // api
        organization,
        expect.objectContaining({id: '1'})
      );
    });
  });

  describe('modifying a saved query', () => {
    let mockUtils;

    it('renders the correct set of buttons', () => {
      SavedQueriesStore.state = {
        isLoading: false,
        hasError: false,
        savedQueries: [errorsViewSaved.toNewQuery()],
      };
      const wrapper = generateWrappedComponent(
        location,
        organization,
        errorsViewModified
      );

      const buttonSaveAs = wrapper.find(SELECTOR_BUTTON_SAVE_AS);
      const buttonSaved = wrapper.find(SELECTOR_BUTTON_SAVED);
      const buttonUpdate = wrapper.find(SELECTOR_BUTTON_UPDATE);
      const buttonDelete = wrapper.find(SELECTOR_BUTTON_DELETE);

      expect(buttonSaveAs.exists()).toBe(true);
      expect(buttonSaved.exists()).toBe(false);
      expect(buttonUpdate.exists()).toBe(true);
      expect(buttonDelete.exists()).toBe(true);
    });

    describe('updates the saved query', () => {
      beforeEach(() => {
        mockUtils = jest
          .spyOn(utils, 'handleUpdateQuery')
          .mockImplementation(() => Promise.resolve(errorsSavedQuery));
      });

      afterEach(() => {
        mockUtils.mockClear();
      });

      it('accepts a well-formed query', async () => {
        const wrapper = generateWrappedComponent(
          location,
          organization,
          errorsViewModified
        );

        // Click on Save in the Dropdown
        const buttonUpdate = wrapper.find(SELECTOR_BUTTON_UPDATE).first();
        buttonUpdate.simulate('click');

        expect(mockUtils).toHaveBeenCalledWith(
          expect.anything(), // api
          organization,
          expect.objectContaining({
            ...errorsViewModified,
          })
        );
      });
    });

    describe('creates a separate query', () => {
      beforeEach(() => {
        mockUtils = jest
          .spyOn(utils, 'handleCreateQuery')
          .mockImplementation(() => Promise.resolve(errorsSavedQuery));
      });

      afterEach(() => {
        mockUtils.mockClear();
      });

      it('checks that it is forked from a saved query', async () => {
        const wrapper = generateWrappedComponent(
          location,
          organization,
          errorsViewModified
        );

        // Click on ButtonSaveAs to open dropdown
        const buttonSaveAs = wrapper.find('DropdownControl').first();
        buttonSaveAs.simulate('click');

        // Fill in the Input
        buttonSaveAs
          .find('ButtonSaveInput')
          .simulate('change', {target: {value: 'Forked Query'}});
        await tick();

        // Click on Save in the Dropdown
        buttonSaveAs.find('ButtonSaveDropDown Button').simulate('click');

        expect(mockUtils).toHaveBeenCalledWith(
          expect.anything(), // api
          organization,
          expect.objectContaining({
            ...errorsViewModified,
            name: 'Forked Query',
          }),
          false
        );
      });
    });
  });
});
