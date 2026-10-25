const {
  mountReactIslands,
  unmountReactIslands,
  resetReactIslandsForTest
} = require('../../../../src/client/react/bootstrap/mountReactIslands');

describe('mountReactIslands', () => {
  beforeEach(() => {
    resetReactIslandsForTest();
  });

  afterEach(() => {
    resetReactIslandsForTest();
  });

  test('mounts header island when feature enabled and node exists', () => {
    const render = jest.fn();
    const createRoot = jest.fn(() => ({ render, unmount: jest.fn() }));
    const node = { id: 'react-header-island' };
    const documentMock = {
      getElementById: jest.fn(() => node)
    };

    mountReactIslands({
      createRoot,
      documentRef: documentMock,
      featureFlags: { reactHeaderIsland: true }
    });

    expect(documentMock.getElementById).toHaveBeenCalledWith('react-header-island');
    expect(createRoot).toHaveBeenCalledWith(node);
    expect(render).toHaveBeenCalledTimes(1);
  });

  test('does not mount when feature is disabled', () => {
    const createRoot = jest.fn();
    const documentMock = {
      getElementById: jest.fn(() => ({ id: 'react-header-island' }))
    };

    mountReactIslands({
      createRoot,
      documentRef: documentMock,
      featureFlags: { reactHeaderIsland: false }
    });

    expect(createRoot).not.toHaveBeenCalled();
  });

  test('mount is idempotent and unmount tears down root', () => {
    const unmount = jest.fn();
    const render = jest.fn();
    const createRoot = jest.fn(() => ({ render, unmount }));
    const documentMock = {
      getElementById: jest.fn(() => ({ id: 'react-header-island' }))
    };

    mountReactIslands({
      createRoot,
      documentRef: documentMock,
      featureFlags: { reactHeaderIsland: true }
    });

    mountReactIslands({
      createRoot,
      documentRef: documentMock,
      featureFlags: { reactHeaderIsland: true }
    });

    expect(createRoot).toHaveBeenCalledTimes(1);

    unmountReactIslands();
    expect(unmount).toHaveBeenCalledTimes(1);
  });
});
