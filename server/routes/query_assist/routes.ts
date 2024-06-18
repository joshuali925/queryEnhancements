import { schema, Type } from '@osd/config-schema';
import { IRouter } from 'opensearch-dashboards/server';
import { isResponseError } from '../../../../../src/core/server/opensearch/client/errors';
import { ERROR_DETAILS, SUPPORTED_LANGUAGES } from '../../../common/query_assist';
import { getAgentIdByConfig, requestAgentByConfig } from './agents';
import { AGENT_CONFIG_NAME_MAP } from './index';
import { createPPLResponseBody } from './ppl/create_response';

export function registerQueryAssistRoutes(router: IRouter) {
  const languageSchema = schema.oneOf(SUPPORTED_LANGUAGES.map(schema.literal) as [Type<'PPL'>]);

  router.get(
    {
      path: '/api/ql/query_assist/configured_languages',
      validate: {
        query: schema.object({
          dataSourceId: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) => {
      const client =
        context.query_assist.dataSourceEnabled && request.query.dataSourceId
          ? await context.dataSource.opensearch.getClient(request.query.dataSourceId)
          : context.core.opensearch.client.asCurrentUser;
      const configuredLanguages: string[] = [];
      try {
        await Promise.allSettled(
          SUPPORTED_LANGUAGES.map((language) =>
            getAgentIdByConfig(client, AGENT_CONFIG_NAME_MAP[language]).then(() =>
              // if the call does not throw any error, then the agent is properly configured
              configuredLanguages.push(language)
            )
          )
        );
        return response.ok({ body: { configuredLanguages } });
      } catch (error) {
        return response.ok({ body: { configuredLanguages, error: error.message } });
      }
    }
  );

  router.post(
    {
      path: '/api/ql/query_assist/generate',
      validate: {
        body: schema.object({
          index: schema.string(),
          question: schema.string(),
          language: languageSchema,
          dataSourceId: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const agentResponse = await requestAgentByConfig({
          context,
          configName: AGENT_CONFIG_NAME_MAP[request.body.language],
          body: {
            parameters: {
              index: request.body.index,
              question: request.body.question,
            },
          },
          dataSourceId: request.body.dataSourceId,
        });
        const responseBody = createPPLResponseBody(agentResponse);
        return response.ok({ body: responseBody });
      } catch (error) {
        if (isResponseError(error)) {
          if (error.statusCode === 400 && error.body.includes(ERROR_DETAILS.GUARDRAILS_TRIGGERED))
            return response.badRequest({ body: ERROR_DETAILS.GUARDRAILS_TRIGGERED });
          return response.badRequest({
            body:
              typeof error.meta.body === 'string'
                ? error.meta.body
                : JSON.stringify(error.meta.body),
          });
        }
        return response.custom({ statusCode: error.statusCode || 500, body: error.message });
      }
    }
  );
}
