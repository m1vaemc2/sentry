from __future__ import absolute_import
import six

import responses
from django.core.urlresolvers import reverse

from sentry.integrations.slack.utils import (
    build_group_attachment,
    build_incident_attachment,
    CHANNEL_PREFIX,
    get_channel_id,
    LEVEL_TO_COLOR,
    MEMBER_PREFIX,
)
from sentry.models import Integration
from sentry.testutils import TestCase
from sentry.utils import json
from sentry.utils.assets import get_asset_url
from sentry.utils.dates import to_timestamp
from sentry.utils.http import absolute_uri


class GetChannelIdTest(TestCase):
    def setUp(self):
        self.resp = responses.mock
        self.resp.__enter__()

        self.integration = Integration.objects.create(
            provider="slack",
            name="Awesome Team",
            external_id="TXXXXXXX1",
            metadata={"access_token": "xoxp-xxxxxxxxx-xxxxxxxxxx-xxxxxxxxxxxx"},
        )
        self.integration.add_organization(self.event.project.organization, self.user)
        self.add_list_response(
            "channels",
            [{"name": "my-channel", "id": "m-c"}, {"name": "other-chann", "id": "o-c"}],
            result_name="channels",
        )
        self.add_list_response(
            "groups", [{"name": "my-private-channel", "id": "m-p-c"}], result_name="groups"
        )
        self.add_list_response(
            "users",
            [{"name": "morty", "id": "m"}, {"name": "other-user", "id": "o-u"}],
            result_name="members",
        )

    def tearDown(self):
        self.resp.__exit__(None, None, None)

    def add_list_response(self, list_type, channels, result_name="channels"):
        self.resp.add(
            method=responses.GET,
            url="https://slack.com/api/%s.list" % list_type,
            status=200,
            content_type="application/json",
            body=json.dumps({"ok": "true", result_name: channels}),
        )

    def run_valid_test(self, channel, expected_prefix, expected_id):
        assert (expected_prefix, expected_id) == get_channel_id(
            self.organization, self.integration.id, channel
        )

    def test_valid_channel_selected(self):
        self.run_valid_test("#my-channel", CHANNEL_PREFIX, "m-c")

    def test_valid_private_channel_selected(self):
        self.run_valid_test("#my-private-channel", CHANNEL_PREFIX, "m-p-c")

    def test_valid_member_selected(self):
        self.run_valid_test("@morty", MEMBER_PREFIX, "m")

    def test_invalid_channel_selected(self):
        assert get_channel_id(self.organization, self.integration.id, "#fake-channel") is None
        assert get_channel_id(self.organization, self.integration.id, "@fake-user") is None


class BuildIncidentAttachmentTest(TestCase):
    def test_simple(self):
        logo_url = absolute_uri(get_asset_url("sentry", "images/sentry-email-avatar.png"))

        incident = self.create_incident()
        title = "INCIDENT: {} (#{})".format(incident.title, incident.identifier)
        assert build_incident_attachment(incident) == {
            "fallback": title,
            "title": title,
            "title_link": absolute_uri(
                reverse(
                    "sentry-incident",
                    kwargs={
                        "organization_slug": incident.organization.slug,
                        "incident_id": incident.identifier,
                    },
                )
            ),
            "text": " ",
            "fields": [
                {"title": "Status", "value": "Open", "short": True},
                {"title": "Events", "value": 0, "short": True},
                {"title": "Users", "value": 0, "short": True},
            ],
            "mrkdwn_in": ["text"],
            "footer_icon": logo_url,
            "footer": "Sentry Incident",
            "ts": to_timestamp(incident.date_started),
            "color": LEVEL_TO_COLOR["error"],
            "actions": [],
        }

    def test_build_group_attachment(self):
        self.user = self.create_user("foo@example.com")
        self.org = self.create_organization(name="Rowdy Tiger", owner=None)
        self.team = self.create_team(organization=self.org, name="Mariachi Band")
        self.project = self.create_project(
            organization=self.org, teams=[self.team], name="Bengal-Elephant-Giraffe-Tree-House"
        )
        self.create_member(user=self.user, organization=self.org, role="owner", teams=[self.team])
        group = self.create_group(project=self.project)
        ts = group.last_seen
        assert build_group_attachment(group) == {
            "color": "#E03E2F",
            "text": "",
            "actions": [
                {"name": "status", "text": "Resolve", "type": "button", "value": "resolved"},
                {"text": "Ignore", "type": "button", "name": "status", "value": "ignored"},
                {
                    "option_groups": [
                        {
                            "text": "Teams",
                            "options": [
                                {
                                    "text": u"#mariachi-band",
                                    "value": u"team:" + six.text_type(self.team.id),
                                }
                            ],
                        },
                        {
                            "text": "People",
                            "options": [
                                {
                                    "text": u"foo@example.com",
                                    "value": u"user:" + six.text_type(self.user.id),
                                }
                            ],
                        },
                    ],
                    "text": "Select Assignee...",
                    "selected_options": [None],
                    "type": "select",
                    "name": "assign",
                },
            ],
            "mrkdwn_in": ["text"],
            "title": group.title,
            "fields": [],
            "footer": u"BENGAL-ELEPHANT-GIRAFFE-TREE-HOUSE-1",
            "ts": to_timestamp(ts),
            "title_link": u"http://testserver/organizations/rowdy-tiger/issues/"
            + six.text_type(group.id)
            + "/?referrer=slack",
            "callback_id": '{"issue":' + six.text_type(group.id) + "}",
            "fallback": u"[{}] {}".format(self.project.slug, group.title),
            "footer_icon": u"http://testserver/_static/{version}/sentry/images/sentry-email-avatar.png",
        }
        event = self.create_event()
        ts = event.datetime
        assert build_group_attachment(group, event) == {
            "color": "error",
            "text": "",
            "actions": [
                {"name": "status", "text": "Resolve", "type": "button", "value": "resolved"},
                {"text": "Ignore", "type": "button", "name": "status", "value": "ignored"},
                {
                    "option_groups": [
                        {
                            "text": "Teams",
                            "options": [
                                {
                                    "text": u"#mariachi-band",
                                    "value": u"team:" + six.text_type(self.team.id),
                                }
                            ],
                        },
                        {
                            "text": "People",
                            "options": [
                                {
                                    "text": u"foo@example.com",
                                    "value": u"user:" + six.text_type(self.user.id),
                                }
                            ],
                        },
                    ],
                    "text": "Select Assignee...",
                    "selected_options": [None],
                    "type": "select",
                    "name": "assign",
                },
            ],
            "mrkdwn_in": ["text"],
            "title": event.title,
            "fields": [],
            "footer": u"BENGAL-ELEPHANT-GIRAFFE-TREE-HOUSE-1",
            "ts": to_timestamp(ts),
            "title_link": u"http://testserver/organizations/rowdy-tiger/issues/"
            + six.text_type(group.id)
            + "/?referrer=slack",
            "callback_id": '{"issue":' + six.text_type(group.id) + "}",
            "fallback": u"[{}] {}".format(self.project.slug, event.title),
            "footer_icon": u"http://testserver/_static/{version}/sentry/images/sentry-email-avatar.png",
        }
