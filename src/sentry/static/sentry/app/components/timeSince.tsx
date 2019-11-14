import isNumber from 'lodash/isNumber';
import isString from 'lodash/isString';
import PropTypes from 'prop-types';
import React from 'react';
import moment from 'moment-timezone';

import ConfigStore from 'app/stores/configStore';
import {t} from 'app/locale';

const ONE_MINUTE_IN_MS = 60000;

type RelaxedDateType = string | number | Date;

type Props = {
  /**
   * The date value, can be string, number (e.g. timestamp), or instance of Date
   */
  date: RelaxedDateType;

  /**
   * Suffix after elapsed time
   * e.g. "ago" in "5 minutes ago"
   */

  // TODO(ts): This should be "required", but emotion doesn't seem to like its defaultProps
  suffix?: string;

  className?: string;
};

class TimeSince extends React.PureComponent<Props> {
  static propTypes = {
    date: PropTypes.any.isRequired,
    suffix: PropTypes.string,
  };

  static defaultProps = {
    suffix: 'ago',
  };

  state = {
    relative: '',
  };

  static getDerivedStateFromProps(props: Props) {
    return {
      relative: getRelativeDate(props.date, props.suffix),
    };
  }

  componentDidMount() {
    this.setRelativeDateTicker();
  }

  componentWillUnmount() {
    if (this.ticker) {
      window.clearTimeout(this.ticker);
      this.ticker = null;
    }
  }

  ticker: number | null = null;

  setRelativeDateTicker = () => {
    this.ticker = window.setTimeout(() => {
      this.setState({
        relative: getRelativeDate(this.props.date, this.props.suffix),
      });
      this.setRelativeDateTicker();
    }, ONE_MINUTE_IN_MS);
  };

  render() {
    const date = getDateObj(this.props.date);
    const user = ConfigStore.get('user');
    const options = user ? user.options : {};
    const format = options.clock24Hours ? 'MMMM D YYYY HH:mm:ss z' : 'LLL z';

    return (
      <time
        dateTime={date.toISOString()}
        title={moment.tz(date, options.timezone).format(format)}
        className={this.props.className}
      >
        {this.state.relative}
      </time>
    );
  }
}

export default TimeSince;

function getDateObj(date: RelaxedDateType): Date {
  if (isString(date) || isNumber(date)) {
    date = new Date(date);
  }
  return date;
}

function getRelativeDate(currentDateTime: RelaxedDateType, suffix?: string) {
  const date = getDateObj(currentDateTime);

  if (!suffix) {
    return moment(date).fromNow(true);
  } else if (suffix === 'ago') {
    return moment(date).fromNow();
  } else if (suffix === 'old') {
    return t('%(time)s old', {time: moment(date).fromNow(true)});
  } else {
    throw new Error('Unsupported time format suffix');
  }
}
