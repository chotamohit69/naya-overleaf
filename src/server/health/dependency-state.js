const VALID_STATES = ['unknown', 'healthy', 'unhealthy'];

const DEFAULT_DEPENDENCY_STATE = Object.freeze({
  mongo: 'unknown',
  rabbitmq: 'unknown',
  redis: 'unknown'
});

const createDependencyState = (initialState = {}) => {
  if (!initialState || typeof initialState !== 'object' || Array.isArray(initialState)) {
    throw new Error('initialState must be an object');
  }

  Object.entries(initialState).forEach(([dependencyName, dependencyState]) => {
    if (!VALID_STATES.includes(dependencyState)) {
      throw new Error(`initialState contains invalid dependency state for ${dependencyName}`);
    }
  });

  return Object.freeze({ ...initialState });
};

const updateDependencyState = (currentState, dependencyName, dependencyState) => {
  if (!currentState || typeof currentState !== 'object' || Array.isArray(currentState)) {
    throw new Error('currentState must be an object');
  }

  if (!dependencyName || typeof dependencyName !== 'string' || dependencyName.trim().length === 0) {
    throw new Error('dependencyName must be a non-empty string');
  }

  if (!VALID_STATES.includes(dependencyState)) {
    throw new Error(`dependencyState must be one of: ${VALID_STATES.join(', ')}`);
  }

  return Object.freeze({
    ...currentState,
    [dependencyName]: dependencyState
  });
};

let dependencyState = createDependencyState(DEFAULT_DEPENDENCY_STATE);

const getDependencyState = () => dependencyState;

const setDependencyState = (nextState) => {
  dependencyState = createDependencyState(nextState);
  return dependencyState;
};

const updateSharedDependencyState = (dependencyName, nextDependencyState) => {
  dependencyState = updateDependencyState(dependencyState, dependencyName, nextDependencyState);
  return dependencyState;
};

module.exports = {
  VALID_STATES,
  createDependencyState,
  updateDependencyState,
  getDependencyState,
  setDependencyState,
  updateSharedDependencyState
};
