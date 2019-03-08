from __future__ import absolute_import

import six
import logging
from uuid import uuid4

from six.moves.urllib.parse import urlparse, urlencode
from sentry.http import safe_urlopen, safe_urlread
from sentry.coreapi import APIError
from sentry.mediators import Mediator, Param
from sentry.mediators.external_requests.util import validate
from sentry.utils import json
from sentry.utils.cache import memoize

logger = logging.getLogger('sentry.mediators.external-requests')


class SelectRequester(Mediator):
    """
    1. Makes a GET request to another service to fetch data needed to populate
    the SelectField dropdown in the UI.

    `installationId` and `project` are included in the params of the request

    2. Validates and formats the response.
    """

    install = Param('sentry.models.SentryAppInstallation')
    project = Param('sentry.models.Project', required=False)
    uri = Param(six.string_types)

    def call(self):
        return self._make_request()

    def _build_url(self):
        domain = urlparse(self.sentry_app.webhook_url).netloc
        url = u'https://{}{}'.format(domain, self.uri)
        params = {'installationId': self.install.uuid}
        if self.project:
            params['projectSlug'] = self.project.slug
        url += '?' + urlencode(params)
        return url

    def _make_request(self):
        req = safe_urlopen(
            url=self._build_url(),
            headers=self._build_headers(),
        )

        try:
            body = safe_urlread(req)
            response = json.loads(body)
        except Exception:
            logger.info(
                'select-requester.error',
                extra={
                    'sentry_app': self.sentry_app.slug,
                    'install': self.install.uuid,
                    'project': self.project.slug,
                    'uri': self.uri,
                }
            )
            response = {}

        if not self._validate_response(response):
            raise APIError()

        return self._format_response(response)

    def _validate_response(self, resp):
        return validate(instance=resp, schema_type='select')

    def _format_response(self, resp):
        # the UI expects the following form:
        # choices: [[label, value]]
        # default: [label, value]
        response = {}
        choices = []

        for option in resp:
            choices.append([option['label'], option['value']])
            if option.get('default'):
                response['default'] = [option['label'], option['value']]

        response['choices'] = choices
        return response

    def _build_headers(self):
        request_uuid = uuid4().hex

        return {
            'Content-Type': 'application/json',
            'Request-ID': request_uuid,
            'Sentry-App-Signature': self.sentry_app.build_signature('')
        }

    @memoize
    def sentry_app(self):
        return self.install.sentry_app