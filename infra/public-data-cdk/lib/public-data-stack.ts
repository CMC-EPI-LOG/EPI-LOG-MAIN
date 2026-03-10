import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { Duration } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

function workerEntry(...segments: string[]) {
  return path.join(__dirname, '..', '..', '..', 'workers', 'public-data', 'src', ...segments);
}

function envValue(name: string, fallback = '') {
  return process.env[name] ?? fallback;
}

function envList(name: string) {
  return envValue(name)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function optionalIntegerEnv(name: string) {
  const value = envValue(name).trim();
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.trunc(parsed);
}

function resolveConfigValue(scope: Construct, logicalId: string, name: string, fallback = '') {
  const directValue = process.env[name];
  if (directValue) {
    return directValue;
  }

  const secretName = process.env[`${name}_SECRET_NAME`];
  if (secretName) {
    return secretsmanager.Secret.fromSecretNameV2(
      scope,
      `${logicalId}${name}Secret`,
      secretName,
    ).secretValue.unsafeUnwrap();
  }

  const parameterName = process.env[`${name}_PARAMETER_NAME`];
  if (parameterName) {
    const parameterVersion = process.env[`${name}_PARAMETER_VERSION`];
    if (parameterVersion) {
      return cdk.SecretValue.ssmSecure(parameterName, parameterVersion).unsafeUnwrap();
    }

    return ssm.StringParameter.valueForStringParameter(scope, parameterName);
  }

  return fallback;
}

export class PublicDataStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpcId = envValue('PUBLIC_DATA_VPC_ID');
    const subnetIds = envList('PUBLIC_DATA_SUBNET_IDS');
    const securityGroupIds = envList('PUBLIC_DATA_SECURITY_GROUP_IDS');
    const importedVpc = vpcId ? ec2.Vpc.fromLookup(this, 'PublicDataVpc', { vpcId }) : undefined;
    const importedSubnets =
      importedVpc && subnetIds.length > 0
        ? subnetIds.map((subnetId, index) =>
            ec2.Subnet.fromSubnetId(this, `PublicDataSubnet${index + 1}`, subnetId),
          )
        : undefined;
    const importedSecurityGroups =
      importedVpc && securityGroupIds.length > 0
        ? securityGroupIds.map((securityGroupId, index) =>
            ec2.SecurityGroup.fromSecurityGroupId(
              this,
              `PublicDataLambdaSecurityGroup${index + 1}`,
              securityGroupId,
            ),
          )
        : undefined;
    const lambdaNetworkProps = importedVpc
      ? {
          vpc: importedVpc,
          ...(importedSubnets ? { vpcSubnets: { subnets: importedSubnets } } : {}),
          ...(importedSecurityGroups ? { securityGroups: importedSecurityGroups } : {}),
        }
      : {};
    const reservedConcurrency = optionalIntegerEnv('PUBLIC_DATA_RESERVED_CONCURRENCY');

    let alarmTopic: sns.ITopic | null = null;
    const alarmTopicArn = envValue('ALARM_SNS_TOPIC_ARN');
    const alarmEmail = envValue('ALARM_EMAIL_ADDRESS');
    if (alarmTopicArn) {
      alarmTopic = sns.Topic.fromTopicArn(this, 'PublicDataAlarmTopicImport', alarmTopicArn);
    } else if (alarmEmail) {
      const topic = new sns.Topic(this, 'PublicDataAlarmTopic', {
        topicName: 'public-data-alarms',
      });
      topic.addSubscription(new snsSubscriptions.EmailSubscription(alarmEmail));
      alarmTopic = topic;
    }

    const scheduleGroup = new scheduler.CfnScheduleGroup(this, 'PublicDataScheduleGroup', {
      name: 'public-data',
    });

    const airKoreaDlq = new sqs.Queue(this, 'AirKoreaIngestDlq', {
      queueName: 'airkorea-ingest-dlq',
      retentionPeriod: Duration.days(14),
    });

    const airKoreaForecastDlq = new sqs.Queue(this, 'AirKoreaForecastIngestDlq', {
      queueName: 'airkorea-forecast-ingest-dlq',
      retentionPeriod: Duration.days(14),
    });

    const kmaDlq = new sqs.Queue(this, 'KmaShortForecastIngestDlq', {
      queueName: 'kma-short-forecast-ingest-dlq',
      retentionPeriod: Duration.days(14),
    });

    const kmaLifestyleDlq = new sqs.Queue(this, 'KmaLifestyleIngestDlq', {
      queueName: 'kma-lifestyle-ingest-dlq',
      retentionPeriod: Duration.days(14),
    });

    const commonBundling: Pick<lambdaNodejs.NodejsFunctionProps, 'bundling'> = {
      bundling: {
        target: 'node20',
        format: lambdaNodejs.OutputFormat.CJS,
        minify: false,
        sourceMap: true,
      },
    };

    const airKoreaFn = new lambdaNodejs.NodejsFunction(this, 'AirKoreaRealtimeIngestFn', {
      entry: workerEntry('airkorea', 'handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: Duration.seconds(60),
      ...(reservedConcurrency !== undefined
        ? { reservedConcurrentExecutions: reservedConcurrency }
        : {}),
      environment: {
        LOG_LEVEL: envValue('LOG_LEVEL', 'info'),
        MONGODB_URI: resolveConfigValue(this, 'AirKoreaFn', 'MONGODB_URI'),
        AIRKOREA_DB_NAME: resolveConfigValue(this, 'AirKoreaFn', 'AIRKOREA_DB_NAME', 'air_quality'),
        AIRKOREA_RAW_COLLECTION: envValue('AIRKOREA_RAW_COLLECTION', 'airkorea_realtime_raw'),
        AIRKOREA_HISTORY_COLLECTION: envValue('AIRKOREA_HISTORY_COLLECTION', 'air_quality_history'),
        AIRKOREA_LATEST_COLLECTION: envValue('AIRKOREA_LATEST_COLLECTION', 'air_quality_latest'),
        AIRKOREA_RUNS_COLLECTION: envValue('AIRKOREA_RUNS_COLLECTION', 'ingest_runs'),
        AIRKOREA_SERVICE_KEY: resolveConfigValue(this, 'AirKoreaFn', 'AIRKOREA_SERVICE_KEY'),
        AIRKOREA_BASE_URL: envValue(
          'AIRKOREA_BASE_URL',
          'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty',
        ),
        AIRKOREA_API_VERSION: envValue('AIRKOREA_API_VERSION', '1.0'),
      },
      ...lambdaNetworkProps,
      ...commonBundling,
    });

    const airKoreaForecastFn = new lambdaNodejs.NodejsFunction(this, 'AirKoreaForecastIngestFn', {
      entry: workerEntry('airkorea-forecast', 'handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: Duration.seconds(60),
      ...(reservedConcurrency !== undefined
        ? { reservedConcurrentExecutions: reservedConcurrency }
        : {}),
      environment: {
        LOG_LEVEL: envValue('LOG_LEVEL', 'info'),
        MONGODB_URI: resolveConfigValue(this, 'AirKoreaForecastFn', 'MONGODB_URI'),
        AIRKOREA_DB_NAME: resolveConfigValue(
          this,
          'AirKoreaForecastFn',
          'AIRKOREA_DB_NAME',
          'air_quality',
        ),
        AIRKOREA_FORECAST_RAW_COLLECTION: envValue(
          'AIRKOREA_FORECAST_RAW_COLLECTION',
          'airkorea_forecast_raw',
        ),
        AIRKOREA_FORECAST_LATEST_COLLECTION: envValue(
          'AIRKOREA_FORECAST_LATEST_COLLECTION',
          'air_quality_forecast_daily',
        ),
        AIRKOREA_FORECAST_RUNS_COLLECTION: envValue(
          'AIRKOREA_FORECAST_RUNS_COLLECTION',
          'ingest_runs_forecast',
        ),
        AIRKOREA_SERVICE_KEY: resolveConfigValue(
          this,
          'AirKoreaForecastFn',
          'AIRKOREA_SERVICE_KEY',
        ),
        AIRKOREA_FORECAST_BASE_URL: envValue(
          'AIRKOREA_FORECAST_BASE_URL',
          'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMinuDustFrcstDspth',
        ),
        AIRKOREA_FORECAST_API_VERSION: envValue('AIRKOREA_FORECAST_API_VERSION', 'forecast-v1'),
      },
      ...lambdaNetworkProps,
      ...commonBundling,
    });

    const kmaShortForecastFn = new lambdaNodejs.NodejsFunction(this, 'KmaShortForecastIngestFn', {
      entry: workerEntry('kma-short-forecast', 'handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: Duration.minutes(5),
      ...(reservedConcurrency !== undefined
        ? { reservedConcurrentExecutions: reservedConcurrency }
        : {}),
      environment: {
        LOG_LEVEL: envValue('LOG_LEVEL', 'info'),
        MONGODB_URI: resolveConfigValue(this, 'KmaFn', 'MONGODB_URI'),
        WEATHER_FORECAST_DB_NAME: resolveConfigValue(
          this,
          'KmaFn',
          'WEATHER_FORECAST_DB_NAME',
          'weather_forecast',
        ),
        WEATHER_FORECAST_WRITER_COLLECTION: envValue(
          'WEATHER_FORECAST_WRITER_COLLECTION',
          'weather_forecast_data_shadow',
        ),
        WEATHER_FORECAST_RUNS_COLLECTION: envValue(
          'WEATHER_FORECAST_RUNS_COLLECTION',
          'ingest_runs_shadow',
        ),
        KMA_SERVICE_KEY: resolveConfigValue(this, 'KmaFn', 'KMA_SERVICE_KEY'),
        KMA_BASE_URL: envValue(
          'KMA_BASE_URL',
          'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst',
        ),
      },
      ...lambdaNetworkProps,
      ...commonBundling,
    });

    const kmaLifestyleFn = new lambdaNodejs.NodejsFunction(this, 'KmaLifestyleIngestFn', {
      entry: workerEntry('kma-lifestyle', 'handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: Duration.minutes(2),
      ...(reservedConcurrency !== undefined
        ? { reservedConcurrentExecutions: reservedConcurrency }
        : {}),
      environment: {
        LOG_LEVEL: envValue('LOG_LEVEL', 'info'),
        MONGODB_URI: resolveConfigValue(this, 'KmaLifestyleFn', 'MONGODB_URI'),
        WEATHER_FORECAST_DB_NAME: resolveConfigValue(
          this,
          'KmaLifestyleFn',
          'WEATHER_FORECAST_DB_NAME',
          'weather_forecast',
        ),
        KMA_LIFESTYLE_RAW_COLLECTION: envValue(
          'KMA_LIFESTYLE_RAW_COLLECTION',
          'kma_lifestyle_raw',
        ),
        KMA_LIFESTYLE_LATEST_COLLECTION: envValue(
          'KMA_LIFESTYLE_LATEST_COLLECTION',
          'lifestyle_indices_daily',
        ),
        KMA_LIFESTYLE_RUNS_COLLECTION: envValue(
          'KMA_LIFESTYLE_RUNS_COLLECTION',
          'ingest_runs_lifestyle',
        ),
        KMA_SERVICE_KEY: resolveConfigValue(this, 'KmaLifestyleFn', 'KMA_SERVICE_KEY'),
        KMA_UV_SERVICE_KEY: resolveConfigValue(this, 'KmaLifestyleFn', 'KMA_UV_SERVICE_KEY'),
        KMA_POLLEN_SERVICE_KEY: resolveConfigValue(
          this,
          'KmaLifestyleFn',
          'KMA_POLLEN_SERVICE_KEY',
        ),
        KMA_UV_BASE_URL: envValue(
          'KMA_UV_BASE_URL',
          'https://apis.data.go.kr/1360000/LivingWthrIdxServiceV4/getUVIdxV4',
        ),
        KMA_PINE_POLLEN_BASE_URL: envValue(
          'KMA_PINE_POLLEN_BASE_URL',
          'https://apis.data.go.kr/1360000/HealthWthrIdxServiceV3/getPinePollenRiskIdxV3',
        ),
        KMA_OAK_POLLEN_BASE_URL: envValue(
          'KMA_OAK_POLLEN_BASE_URL',
          'https://apis.data.go.kr/1360000/HealthWthrIdxServiceV3/getOakPollenRiskIdxV3',
        ),
        KMA_WEED_POLLEN_BASE_URL: envValue(
          'KMA_WEED_POLLEN_BASE_URL',
          'https://apis.data.go.kr/1360000/HealthWthrIdxServiceV3/getWeedsPollenRiskndxV3',
        ),
        KMA_LIFESTYLE_SOURCE_VERSION: envValue('KMA_LIFESTYLE_SOURCE_VERSION', 'lifestyle-v1'),
      },
      ...lambdaNetworkProps,
      ...commonBundling,
    });

    const backfillFn = new lambdaNodejs.NodejsFunction(this, 'PublicDataBackfillFn', {
      entry: workerEntry('backfill', 'handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: Duration.minutes(5),
      ...(reservedConcurrency !== undefined
        ? { reservedConcurrentExecutions: reservedConcurrency }
        : {}),
      environment: {
        LOG_LEVEL: envValue('LOG_LEVEL', 'info'),
        MONGODB_URI: resolveConfigValue(this, 'BackfillFn', 'MONGODB_URI'),
        AIRKOREA_DB_NAME: resolveConfigValue(this, 'BackfillFn', 'AIRKOREA_DB_NAME', 'air_quality'),
        AIRKOREA_RAW_COLLECTION: envValue('AIRKOREA_RAW_COLLECTION', 'airkorea_realtime_raw'),
        AIRKOREA_HISTORY_COLLECTION: envValue('AIRKOREA_HISTORY_COLLECTION', 'air_quality_history'),
        AIRKOREA_LATEST_COLLECTION: envValue('AIRKOREA_LATEST_COLLECTION', 'air_quality_latest'),
        AIRKOREA_RUNS_COLLECTION: envValue('AIRKOREA_RUNS_COLLECTION', 'ingest_runs'),
        WEATHER_FORECAST_DB_NAME: resolveConfigValue(
          this,
          'BackfillFn',
          'WEATHER_FORECAST_DB_NAME',
          'weather_forecast',
        ),
        WEATHER_FORECAST_WRITER_COLLECTION: envValue(
          'WEATHER_FORECAST_WRITER_COLLECTION',
          'weather_forecast_data_shadow',
        ),
        WEATHER_FORECAST_RUNS_COLLECTION: envValue(
          'WEATHER_FORECAST_RUNS_COLLECTION',
          'ingest_runs_shadow',
        ),
        AIRKOREA_SERVICE_KEY: resolveConfigValue(this, 'BackfillFn', 'AIRKOREA_SERVICE_KEY'),
        AIRKOREA_BASE_URL: envValue(
          'AIRKOREA_BASE_URL',
          'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty',
        ),
        AIRKOREA_API_VERSION: envValue('AIRKOREA_API_VERSION', '1.0'),
        AIRKOREA_FORECAST_RAW_COLLECTION: envValue(
          'AIRKOREA_FORECAST_RAW_COLLECTION',
          'airkorea_forecast_raw',
        ),
        AIRKOREA_FORECAST_LATEST_COLLECTION: envValue(
          'AIRKOREA_FORECAST_LATEST_COLLECTION',
          'air_quality_forecast_daily',
        ),
        AIRKOREA_FORECAST_RUNS_COLLECTION: envValue(
          'AIRKOREA_FORECAST_RUNS_COLLECTION',
          'ingest_runs_forecast',
        ),
        AIRKOREA_FORECAST_BASE_URL: envValue(
          'AIRKOREA_FORECAST_BASE_URL',
          'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMinuDustFrcstDspth',
        ),
        AIRKOREA_FORECAST_API_VERSION: envValue('AIRKOREA_FORECAST_API_VERSION', 'forecast-v1'),
        KMA_SERVICE_KEY: resolveConfigValue(this, 'BackfillFn', 'KMA_SERVICE_KEY'),
        KMA_BASE_URL: envValue(
          'KMA_BASE_URL',
          'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst',
        ),
        KMA_LIFESTYLE_RAW_COLLECTION: envValue(
          'KMA_LIFESTYLE_RAW_COLLECTION',
          'kma_lifestyle_raw',
        ),
        KMA_LIFESTYLE_LATEST_COLLECTION: envValue(
          'KMA_LIFESTYLE_LATEST_COLLECTION',
          'lifestyle_indices_daily',
        ),
        KMA_LIFESTYLE_RUNS_COLLECTION: envValue(
          'KMA_LIFESTYLE_RUNS_COLLECTION',
          'ingest_runs_lifestyle',
        ),
        KMA_UV_BASE_URL: envValue(
          'KMA_UV_BASE_URL',
          'https://apis.data.go.kr/1360000/LivingWthrIdxServiceV4/getUVIdxV4',
        ),
        KMA_UV_SERVICE_KEY: resolveConfigValue(this, 'BackfillFn', 'KMA_UV_SERVICE_KEY'),
        KMA_POLLEN_SERVICE_KEY: resolveConfigValue(
          this,
          'BackfillFn',
          'KMA_POLLEN_SERVICE_KEY',
        ),
        KMA_PINE_POLLEN_BASE_URL: envValue(
          'KMA_PINE_POLLEN_BASE_URL',
          'https://apis.data.go.kr/1360000/HealthWthrIdxServiceV3/getPinePollenRiskIdxV3',
        ),
        KMA_OAK_POLLEN_BASE_URL: envValue(
          'KMA_OAK_POLLEN_BASE_URL',
          'https://apis.data.go.kr/1360000/HealthWthrIdxServiceV3/getOakPollenRiskIdxV3',
        ),
        KMA_WEED_POLLEN_BASE_URL: envValue(
          'KMA_WEED_POLLEN_BASE_URL',
          'https://apis.data.go.kr/1360000/HealthWthrIdxServiceV3/getWeedsPollenRiskndxV3',
        ),
        KMA_LIFESTYLE_SOURCE_VERSION: envValue('KMA_LIFESTYLE_SOURCE_VERSION', 'lifestyle-v1'),
      },
      ...lambdaNetworkProps,
      ...commonBundling,
    });

    const airKoreaSchedulerRole = new iam.Role(this, 'AirKoreaSchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    airKoreaFn.grantInvoke(airKoreaSchedulerRole);
    airKoreaDlq.grantSendMessages(airKoreaSchedulerRole);

    const airKoreaForecastSchedulerRole = new iam.Role(this, 'AirKoreaForecastSchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    airKoreaForecastFn.grantInvoke(airKoreaForecastSchedulerRole);
    airKoreaForecastDlq.grantSendMessages(airKoreaForecastSchedulerRole);

    const kmaSchedulerRole = new iam.Role(this, 'KmaSchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    kmaShortForecastFn.grantInvoke(kmaSchedulerRole);
    kmaDlq.grantSendMessages(kmaSchedulerRole);

    const kmaLifestyleSchedulerRole = new iam.Role(this, 'KmaLifestyleSchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    kmaLifestyleFn.grantInvoke(kmaLifestyleSchedulerRole);
    kmaLifestyleDlq.grantSendMessages(kmaLifestyleSchedulerRole);

    const airKoreaSchedule = new scheduler.CfnSchedule(this, 'AirKoreaRealtimeSchedule', {
      groupName: scheduleGroup.name,
      name: 'airkorea-realtime-20m',
      description: 'Ingest AirKorea realtime measurements every 20 minutes in KST.',
      flexibleTimeWindow: { mode: 'OFF' },
      scheduleExpression: 'cron(7,27,47 * * * ? *)',
      scheduleExpressionTimezone: 'Asia/Seoul',
      target: {
        arn: airKoreaFn.functionArn,
        roleArn: airKoreaSchedulerRole.roleArn,
        deadLetterConfig: { arn: airKoreaDlq.queueArn },
        retryPolicy: {
          maximumEventAgeInSeconds: 3600,
          maximumRetryAttempts: 2,
        },
        input: JSON.stringify({
          job: 'airkorea-realtime',
          trigger: 'scheduler',
        }),
      },
      state: 'ENABLED',
    });

    const airKoreaPostHourRecheckSchedule = new scheduler.CfnSchedule(
      this,
      'AirKoreaRealtimePostHourRecheckSchedule',
      {
        groupName: scheduleGroup.name,
        name: 'airkorea-realtime-posthour-recheck',
        description:
          'Recheck AirKorea realtime measurements at :17 KST to catch delayed top-of-hour publication.',
        flexibleTimeWindow: { mode: 'OFF' },
        scheduleExpression: 'cron(17 * * * ? *)',
        scheduleExpressionTimezone: 'Asia/Seoul',
        target: {
          arn: airKoreaFn.functionArn,
          roleArn: airKoreaSchedulerRole.roleArn,
          deadLetterConfig: { arn: airKoreaDlq.queueArn },
          retryPolicy: {
            maximumEventAgeInSeconds: 3600,
            maximumRetryAttempts: 2,
          },
          input: JSON.stringify({
            job: 'airkorea-realtime',
            trigger: 'scheduler-posthour-recheck',
          }),
        },
        state: 'ENABLED',
      },
    );

    const airKoreaForecastSchedule = new scheduler.CfnSchedule(
      this,
      'AirKoreaForecastSchedule',
      {
        groupName: scheduleGroup.name,
        name: 'airkorea-forecast-hourly',
        description: 'Ingest AirKorea daily dust forecast every hour in KST.',
        flexibleTimeWindow: { mode: 'OFF' },
        scheduleExpression: 'cron(23 * * * ? *)',
        scheduleExpressionTimezone: 'Asia/Seoul',
        target: {
          arn: airKoreaForecastFn.functionArn,
          roleArn: airKoreaForecastSchedulerRole.roleArn,
          deadLetterConfig: { arn: airKoreaForecastDlq.queueArn },
          retryPolicy: {
            maximumEventAgeInSeconds: 3600,
            maximumRetryAttempts: 2,
          },
          input: JSON.stringify({
            job: 'airkorea-forecast',
            trigger: 'scheduler',
          }),
        },
        state: 'ENABLED',
      },
    );

    const kmaSchedule = new scheduler.CfnSchedule(this, 'KmaShortForecastSchedule', {
      groupName: scheduleGroup.name,
      name: 'kma-short-forecast-30m',
      description: 'Ingest KMA short forecast data every 30 minutes in KST.',
      flexibleTimeWindow: { mode: 'OFF' },
      scheduleExpression: 'cron(12,42 * * * ? *)',
      scheduleExpressionTimezone: 'Asia/Seoul',
      target: {
        arn: kmaShortForecastFn.functionArn,
        roleArn: kmaSchedulerRole.roleArn,
        deadLetterConfig: { arn: kmaDlq.queueArn },
        retryPolicy: {
          maximumEventAgeInSeconds: 7200,
          maximumRetryAttempts: 2,
        },
        input: JSON.stringify({
          job: 'kma-short-forecast',
          trigger: 'scheduler',
        }),
      },
      state: 'ENABLED',
    });

    const kmaLifestyleSchedule = new scheduler.CfnSchedule(this, 'KmaLifestyleSchedule', {
      groupName: scheduleGroup.name,
      name: 'kma-lifestyle-3h',
      description: 'Ingest KMA UV and pollen indices every 3 hours in KST.',
      flexibleTimeWindow: { mode: 'OFF' },
      scheduleExpression: 'cron(20 0/3 * * ? *)',
      scheduleExpressionTimezone: 'Asia/Seoul',
      target: {
        arn: kmaLifestyleFn.functionArn,
        roleArn: kmaLifestyleSchedulerRole.roleArn,
        deadLetterConfig: { arn: kmaLifestyleDlq.queueArn },
        retryPolicy: {
          maximumEventAgeInSeconds: 7200,
          maximumRetryAttempts: 1,
        },
        input: JSON.stringify({
          job: 'kma-lifestyle',
          trigger: 'scheduler',
        }),
      },
      state: 'ENABLED',
    });

    airKoreaPostHourRecheckSchedule.node.addDependency(scheduleGroup);
    airKoreaForecastSchedule.node.addDependency(scheduleGroup);
    kmaLifestyleSchedule.node.addDependency(scheduleGroup);

    const airKoreaLambdaErrorsAlarm = new cloudwatch.Alarm(this, 'AirKoreaLambdaErrorsAlarm', {
      metric: airKoreaFn.metricErrors(),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
    });

    const airKoreaForecastLambdaErrorsAlarm = new cloudwatch.Alarm(
      this,
      'AirKoreaForecastLambdaErrorsAlarm',
      {
        metric: airKoreaForecastFn.metricErrors(),
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
      },
    );

    const kmaLambdaErrorsAlarm = new cloudwatch.Alarm(this, 'KmaLambdaErrorsAlarm', {
      metric: kmaShortForecastFn.metricErrors(),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
    });

    const kmaLifestyleLambdaErrorsAlarm = new cloudwatch.Alarm(
      this,
      'KmaLifestyleLambdaErrorsAlarm',
      {
        metric: kmaLifestyleFn.metricErrors(),
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
      },
    );

    const airKoreaDlqMessagesAlarm = new cloudwatch.Alarm(this, 'AirKoreaDlqMessagesAlarm', {
      metric: airKoreaDlq.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
    });

    const airKoreaForecastDlqMessagesAlarm = new cloudwatch.Alarm(
      this,
      'AirKoreaForecastDlqMessagesAlarm',
      {
        metric: airKoreaForecastDlq.metricApproximateNumberOfMessagesVisible(),
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
      },
    );

    const kmaDlqMessagesAlarm = new cloudwatch.Alarm(this, 'KmaDlqMessagesAlarm', {
      metric: kmaDlq.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
    });

    const kmaLifestyleDlqMessagesAlarm = new cloudwatch.Alarm(
      this,
      'KmaLifestyleDlqMessagesAlarm',
      {
        metric: kmaLifestyleDlq.metricApproximateNumberOfMessagesVisible(),
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
      },
    );

    if (alarmTopic) {
      const alarmAction = new cloudwatchActions.SnsAction(alarmTopic);
      airKoreaLambdaErrorsAlarm.addAlarmAction(alarmAction);
      airKoreaForecastLambdaErrorsAlarm.addAlarmAction(alarmAction);
      kmaLambdaErrorsAlarm.addAlarmAction(alarmAction);
      kmaLifestyleLambdaErrorsAlarm.addAlarmAction(alarmAction);
      airKoreaDlqMessagesAlarm.addAlarmAction(alarmAction);
      airKoreaForecastDlqMessagesAlarm.addAlarmAction(alarmAction);
      kmaDlqMessagesAlarm.addAlarmAction(alarmAction);
      kmaLifestyleDlqMessagesAlarm.addAlarmAction(alarmAction);
    }

    new cdk.CfnOutput(this, 'AirKoreaFunctionName', {
      value: airKoreaFn.functionName,
    });

    new cdk.CfnOutput(this, 'KmaShortForecastFunctionName', {
      value: kmaShortForecastFn.functionName,
    });

    new cdk.CfnOutput(this, 'AirKoreaForecastFunctionName', {
      value: airKoreaForecastFn.functionName,
    });

    new cdk.CfnOutput(this, 'KmaLifestyleFunctionName', {
      value: kmaLifestyleFn.functionName,
    });

    new cdk.CfnOutput(this, 'BackfillFunctionName', {
      value: backfillFn.functionName,
    });

    if (alarmTopic) {
      new cdk.CfnOutput(this, 'AlarmTopicArn', {
        value: alarmTopic.topicArn,
      });
    }
  }
}
