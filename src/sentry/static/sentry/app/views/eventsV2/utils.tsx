import partial from 'lodash/partial';
import pick from 'lodash/pick';
import {Location, Query} from 'history';
import {browserHistory} from 'react-router';

import {t} from 'app/locale';
import {Event} from 'app/types';
import {Client} from 'app/api';
import {getTitle} from 'app/utils/events';
import {URL_PARAM} from 'app/constants/globalSelectionHeader';
import {generateQueryWithTag} from 'app/utils';

import {
  AGGREGATE_ALIASES,
  SPECIAL_FIELDS,
  LINK_FORMATTERS,
  FIELD_FORMATTERS,
  FieldTypes,
  FieldFormatterRenderFunctionPartial,
} from './data';
import EventView, {Field as FieldType} from './eventView';
import {
  Aggregation,
  Field,
  AGGREGATIONS,
  FIELDS,
  ColumnValueType,
  DURATION_FIELDS,
  DURATION_AGGREGATION_WHITELIST,
} from './eventQueryParams';
import {TableColumn} from './table/types';

export type EventQuery = {
  field: Array<string>;
  project?: string;
  sort?: string | string[];
  query: string;
  per_page?: number;
};

const AGGREGATE_PATTERN = /^([^\(]+)\(([a-z\._+]*)\)$/;
const ROUND_BRACKETS_PATTERN = /[\(\)]/;

function explodeFieldString(field: string): {aggregation: string; field: string} {
  const results = field.match(AGGREGATE_PATTERN);

  if (results && results.length >= 3) {
    return {aggregation: results[1], field: results[2]};
  }

  return {aggregation: '', field};
}

export function explodeField(
  field: FieldType
): {aggregation: string; field: string; fieldname: string} {
  const results = explodeFieldString(field.field);

  return {aggregation: results.aggregation, field: results.field, fieldname: field.title};
}

function isDuration(input: {aggregation: string; field: string}): boolean {
  if (input.aggregation !== '') {
    if (!DURATION_AGGREGATION_WHITELIST.includes(input.aggregation)) {
      return false;
    }
  }

  return DURATION_FIELDS.includes(input.field);
}

/**
 * Takes a view and determines if there are any aggregate fields in it.
 *
 *
 * @param {Object} view
 * @returns {Boolean}
 */
export function hasAggregateField(eventView: EventView): boolean {
  return eventView
    .getFields()
    .some(
      field => AGGREGATE_ALIASES.includes(field as any) || field.match(AGGREGATE_PATTERN)
    );
}

/**
 * Check if a field name looks like an aggregate function or known aggregate alias.
 */
export function isAggregateField(field: string): boolean {
  return (
    AGGREGATE_ALIASES.includes(field as any) || field.match(AGGREGATE_PATTERN) !== null
  );
}

/**
 * Return a location object for the current pathname
 * with a query string reflected the provided tag.
 *
 * @param {String} tagKey
 * @param {String} tagValue
 * @param {Object} browser location object.
 * @return {Object} router target
 */
export function getEventTagSearchUrl(
  tagKey: string,
  tagValue: string,
  location: Location
) {
  const query = generateQueryWithTag(location.query, {key: tagKey, value: tagValue});

  // Remove the event slug so the user sees new search results.
  delete query.eventSlug;

  return {
    pathname: location.pathname,
    query,
  };
}

export type TagTopValue = {
  name: string;
  url: {
    pathname: string;
    query: any;
  };
  value: string;
};

export type Tag = {
  topValues: Array<TagTopValue>;
};

/**
 * Fetches tag distributions for a single tag key
 *
 * @param {Object} api
 * @param {String} orgSlug
 * @param {String} key
 * @param {String} query
 * @returns {Promise<Object>}
 */
export function fetchTagDistribution(
  api: Client,
  orgSlug: string,
  key: string,
  query: EventQuery
): Promise<Tag> {
  const urlParams = pick(query, Object.values(URL_PARAM));

  const queryOption = {...urlParams, key, query: query.query};

  return api.requestPromise(`/organizations/${orgSlug}/events-distribution/`, {
    query: queryOption,
  });
}

/**
 * Fetches total count of events for a given query
 *
 * @param {Object} api
 * @param {String} orgSlug
 * @param {string} query
 * @returns {Promise<Number>}
 */
export function fetchTotalCount(
  api: Client,
  orgSlug: String,
  query: EventQuery
): Promise<number> {
  const urlParams = pick(query, Object.values(URL_PARAM));

  const queryOption = {...urlParams, query: query.query};

  type Response = {
    count: number;
  };

  return api
    .requestPromise(`/organizations/${orgSlug}/events-meta/`, {
      query: queryOption,
    })
    .then((res: Response) => res.count);
}

export type MetaType = {
  [key: string]: FieldTypes;
};

/**
 * Get the field renderer for the named field and metadata
 *
 * @param {String} field name
 * @param {object} metadata mapping.
 * @param {boolean} Whether or not to coerce a field into a link.
 * @returns {Function}
 */
export function getFieldRenderer(
  field: string,
  meta: MetaType,
  forceLink: boolean
): FieldFormatterRenderFunctionPartial {
  if (SPECIAL_FIELDS.hasOwnProperty(field)) {
    return SPECIAL_FIELDS[field].renderFunc;
  }
  const fieldName = getAggregateAlias(field);
  const fieldType = meta[fieldName];

  // If the current field is being coerced to a link
  // use a different formatter set based on the type.
  if (forceLink && LINK_FORMATTERS.hasOwnProperty(fieldType)) {
    return partial(LINK_FORMATTERS[fieldType], fieldName);
  }

  const explodedField = explodeFieldString(field);

  if (isDuration(explodedField)) {
    return partial(FIELD_FORMATTERS.duration.renderFunc, fieldName);
  }

  if (FIELD_FORMATTERS.hasOwnProperty(fieldType)) {
    return partial(FIELD_FORMATTERS[fieldType].renderFunc, fieldName);
  }
  return partial(FIELD_FORMATTERS.string.renderFunc, fieldName);
}

/**
 * Get the alias that the API results will have for a given aggregate function name
 */
export function getAggregateAlias(field: string): string {
  if (!field.match(AGGREGATE_PATTERN)) {
    return field;
  }
  return field
    .replace(AGGREGATE_PATTERN, '$1_$2')
    .replace('.', '_')
    .replace(/_+$/, '')
    .toLowerCase();
}

export type QueryWithColumnState =
  | Query
  | {
      fieldnames: string | string[] | null | undefined;
      field: string | string[] | null | undefined;
      sort: string | string[] | null | undefined;
    };

const TEMPLATE_TABLE_COLUMN: TableColumn<React.ReactText> = {
  key: '',
  name: '',
  aggregation: '',
  field: '',
  eventViewField: Object.freeze({field: '', title: ''}),
  isDragging: false,

  type: 'never',
  isSortable: false,
  isPrimary: false,
};

export function decodeColumnOrder(props: {
  fieldnames: string[];
  field: string[];
  fields: Readonly<FieldType[]>;
}): TableColumn<React.ReactText>[] {
  const {fieldnames, field, fields} = props;

  return field.map((f: string, index: number) => {
    const col = {aggregationField: f, name: fieldnames[index]};

    const column: TableColumn<React.ReactText> = {...TEMPLATE_TABLE_COLUMN};

    // "field" will be split into ["field"]
    // "agg()" will be split into ["agg", "", ""]
    // "agg(field)" will be split to ["agg", "field", ""]
    // Any column without brackets are assumed to be a field
    const aggregationField = col.aggregationField.split(ROUND_BRACKETS_PATTERN);

    if (aggregationField.length === 1) {
      column.field = aggregationField[0] as Field;
    } else {
      column.aggregation = aggregationField[0] as Aggregation;
      column.field = aggregationField[1] as Field;
    }

    column.key = col.aggregationField;
    column.name = col.name;
    column.type = (FIELDS[column.field] || 'never') as ColumnValueType;

    column.isSortable = AGGREGATIONS[column.aggregation]
      ? AGGREGATIONS[column.aggregation].isSortable
      : false;
    column.isPrimary = column.field === 'title';

    column.eventViewField = {
      title: fields[index].title,
      field: fields[index].field,
    };

    return column;
  });
}

export function pushEventViewToLocation(props: {
  location: Location;
  nextEventView: EventView;
  extraQuery?: Query;
}) {
  const {location, nextEventView} = props;

  const extraQuery = props.extraQuery || {};

  const queryStringObject = nextEventView.generateQueryStringObject();

  browserHistory.push({
    ...location,
    query: {
      ...extraQuery,
      ...queryStringObject,
    },
  });
}

export function generateTitle({eventView, event}: {eventView: EventView; event?: Event}) {
  const titles = [t('Discover')];

  const eventViewName = eventView.name;
  if (typeof eventViewName === 'string' && String(eventViewName).trim().length > 0) {
    titles.push(String(eventViewName).trim());
  }

  const eventTitle = event ? getTitle(event).title : undefined;

  if (eventTitle) {
    titles.push(eventTitle);
  }

  titles.reverse();

  return titles.join(' - ');
}
