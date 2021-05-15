import { createStore } from 'redux';
import reducers from './reducers';

const store = createStore(
  reducers,
  // @ts-ignore - Missing global type
  // eslint-disable-next-line no-underscore-dangle
  window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__(),
);

export type ApplicationState = ReturnType<typeof store['getState']>;
export default store;
