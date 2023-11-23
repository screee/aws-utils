import {
  CloudFormation,
  StackEvent,
  waitUntilStackCreateComplete,
  waitUntilStackDeleteComplete,
  waitUntilStackUpdateComplete,
} from '@aws-sdk/client-cloudformation';
import {isObject} from 'lodash';

interface SyncCloudformationStackOptions {
  StackName: string;
  TemplateBody: string;
  EventHandler: (event: StackEvent) => void;
}

async function getStackSummary(cloudFormation: CloudFormation, StackName: string) {
  const stackList = (await cloudFormation.listStacks({})).StackSummaries;
  return stackList && stackList.find(s => s.StackName === StackName);
}

export async function syncCloudFormationStack<StackOutputs>(
  cloudFormation: CloudFormation,
  {StackName, TemplateBody, EventHandler}: SyncCloudformationStackOptions,
): Promise<StackOutputs> {
  let stack = await getStackSummary(cloudFormation, StackName);

  if (stack?.StackStatus === 'ROLLBACK_COMPLETE') {
    await cloudFormation.deleteStack({StackName});
    await waitUntilStackDeleteComplete({client: cloudFormation, maxWaitTime: 60 * 5}, {StackName});
    stack = await getStackSummary(cloudFormation, StackName);
  }

  if (!stack || stack.StackStatus === 'DELETE_COMPLETE') {
    await cloudFormation.createStack({
      StackName,
      TemplateBody,
      Capabilities: ['CAPABILITY_IAM'],
    });

    const removeEventHandler = addEventHandler(cloudFormation, {StackName, EventHandler});

    await waitUntilStackCreateComplete({client: cloudFormation, maxWaitTime: 60 * 5}, {StackName});

    removeEventHandler();
  } else {
    try {
      await cloudFormation.updateStack({
        StackName,
        TemplateBody,
        Capabilities: ['CAPABILITY_IAM'],
      });
    } catch (error) {
      if (
        isObject(error) &&
        'message' in error &&
        error.message === 'No updates are to be performed.'
      ) {
        // Do nothing
      } else {
        throw error;
      }
    }

    const removeEventHandler = addEventHandler(cloudFormation, {EventHandler, StackName});

    await waitUntilStackUpdateComplete({client: cloudFormation, maxWaitTime: 60 * 5}, {StackName});

    removeEventHandler();
  }

  const response = await cloudFormation.describeStacks({StackName});
  return Object.fromEntries(
    response.Stacks?.[0].Outputs?.map(output => [output.OutputKey, output.OutputValue]) ?? [],
  );
}

function addEventHandler(
  cloudFormation: CloudFormation,
  {StackName, EventHandler}: {StackName: string; EventHandler: (event: StackEvent) => void},
) {
  const startTime = new Date();
  const visitedEvents = new Set<string>();

  const interval = setInterval(async () => {
    const events = await cloudFormation.describeStackEvents({StackName});
    events.StackEvents?.forEach(event => {
      if (!event.EventId || !event.Timestamp) return;
      if (visitedEvents.has(event.EventId) || event.Timestamp <= startTime) return;
      visitedEvents.add(event.EventId);
      EventHandler(event);
    });
  }, 500);

  return () => clearInterval(interval);
}
