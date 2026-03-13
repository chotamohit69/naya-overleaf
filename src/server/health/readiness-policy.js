const SERVICE_DEPENDENCY_POLICY = Object.freeze({
  app: Object.freeze({
    critical: Object.freeze(['mongo', 'rabbitmq']),
    nonCritical: Object.freeze({
      redis: 'cache'
    })
  }),
  worker: Object.freeze({
    critical: Object.freeze(['mongo', 'rabbitmq']),
    nonCritical: Object.freeze({
      redis: 'cache'
    })
  })
});

const evaluateReadiness = (state, serviceName) => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('state must be an object');
  }

  const policy = SERVICE_DEPENDENCY_POLICY[serviceName];

  if (!policy) {
    throw new Error(`Unknown serviceName: ${serviceName}`);
  }

  const reasons = policy.critical.filter((dependency) => state[dependency] !== 'healthy');

  const featureImpacts = Object.entries(policy.nonCritical)
    .filter(([dependency]) => state[dependency] !== 'healthy')
    .map(([, impact]) => impact);

  const ready = reasons.length === 0;
  const degraded = ready && featureImpacts.length > 0;

  return {
    ready,
    degraded,
    reasons,
    featureImpacts
  };
};

module.exports = {
  SERVICE_DEPENDENCY_POLICY,
  evaluateReadiness
};
