import * as ReactRouter from 'react-router';
import debounce from 'lodash/debounce';
import React from 'react';
import styled from 'react-emotion';

import Input from 'app/views/settings/components/forms/controls/input';
import LoadingIndicator from 'app/components/loadingIndicator';
import {Client} from 'app/api';

type Props = ReactRouter.WithRouterProps & {
  api: Client;
  className?: string;
  /**
   * URL to make the search request to
   */
  url: string;
  /**
   * Placeholder text in the search input
   */
  placeholder?: string;
  /**
   * Time in milliseconds to wait before firing off the request
   */
  debounceWait?: number;
  /**
   * Updates URL with search query in the URL param: `query`
   */
  updateRoute?: boolean;

  onSearchSubmit?: (query: string, event: React.FormEvent) => void;
  onSuccess: (data: object, jqXHR: JQueryXHR | undefined) => void;
  onError: () => void;
};

type State = {
  query: string;
  busy: boolean;
};

/**
 * This is a search input that can be easily used in AsyncComponent/Views.
 *
 * It probably doesn't make too much sense outside of an AsyncComponent atm.
 */
class AsyncComponentSearchInput extends React.Component<Props, State> {
  static defaultProps = {
    placeholder: 'Search...',
    debounceWait: 200,
  };

  state: State = {
    query: '',
    busy: false,
  };

  immediateQuery = async (searchQuery: string) => {
    const {location, api} = this.props;
    this.setState({busy: true});

    try {
      const [data, , jqXHR] = await api.requestPromise(`${this.props.url}`, {
        includeAllArgs: true,
        method: 'GET',
        query: {...location.query, query: searchQuery},
      });
      // only update data if the request's query matches the current query
      if (this.state.query === searchQuery) {
        this.props.onSuccess(data, jqXHR);
      }
    } catch {
      this.props.onError();
    }

    this.setState({busy: false});
  };

  query = debounce(this.immediateQuery, this.props.debounceWait);

  handleChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
    const searchQuery = evt.target.value;
    this.query(searchQuery);
    this.setState({query: searchQuery});
  };

  /**
   * This is called when "Enter" (more specifically a form "submit" event) is pressed.
   */
  handleSearch = (evt: React.FormEvent<HTMLFormElement>) => {
    const {updateRoute, onSearchSubmit} = this.props;
    evt.preventDefault();

    // Update the URL to reflect search term.
    if (updateRoute) {
      const {router, location} = this.props;
      router.push({
        pathname: location.pathname,
        query: {
          query: this.state.query,
        },
      });
    }

    if (typeof onSearchSubmit !== 'function') {
      return;
    }
    onSearchSubmit(this.state.query, evt);
  };

  render() {
    const {placeholder, className} = this.props;
    return (
      <Form onSubmit={this.handleSearch}>
        <Input
          value={this.state.query}
          onChange={this.handleChange}
          className={className}
          placeholder={placeholder}
        />
        {this.state.busy && <StyledLoadingIndicator size={18} hideMessage mini />}
      </Form>
    );
  }
}

const StyledLoadingIndicator = styled(LoadingIndicator)`
  position: absolute;
  right: 25px;
  top: 50%;
  transform: translateY(-13px);
`;

const Form = styled('form')`
  position: relative;
`;

// XXX(epurkhiser): The withRouter HoC has incorrect typings. It does not
// correctly remove the WithRouterProps from the return type of the HoC, thus
// we manually have to do this.
type PropsWithoutRouter = Omit<Props, keyof ReactRouter.WithRouterProps>;

export default ReactRouter.withRouter(AsyncComponentSearchInput) as React.ComponentClass<
  PropsWithoutRouter
>;
