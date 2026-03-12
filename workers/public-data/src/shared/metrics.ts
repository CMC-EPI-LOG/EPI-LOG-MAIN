type MetricValue = {
  name: string;
  value: number;
  unit?: 'Count' | 'Milliseconds' | 'None';
};

export function emitMetrics(
  namespace: string,
  dimensions: Record<string, string>,
  metrics: MetricValue[],
  timestamp = Date.now(),
) {
  const dimensionKeys = Object.keys(dimensions);
  const metricDefinitions = metrics.map((metric) => ({
    Name: metric.name,
    Unit: metric.unit || 'Count',
  }));

  const metricValues = Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));

  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: timestamp,
        CloudWatchMetrics: [
          {
            Namespace: namespace,
            Dimensions: [dimensionKeys],
            Metrics: metricDefinitions,
          },
        ],
      },
      ...dimensions,
      ...metricValues,
    }),
  );
}
