import produce from 'immer';
import { RemoteMouseState } from '../typings';
import { HomeActions, HomeActionTypes } from './HomeActions';

interface HomeState {
  allMice: Array<number>;
  byMouseID: Record<number, RemoteMouseState>;
}

const initialState: HomeState = {
  allMice: [],
  byMouseID: {},
};

const HomeReducer = produce((draft, action: HomeActions) => {
  switch (action.type) {
    case HomeActionTypes.CREATE_MOUSE: {
      const { id, mouse } = action.payload;

      if (id in draft.byMouseID) {
        break;
      }

      draft.allMice.push(id);
      draft.byMouseID[id] = mouse;
      break;
    }
    case HomeActionTypes.UPDATE_MOUSE: {
      const { id, mouse } = action.payload;
      const currentMouse = draft.byMouseID[id];
      draft.byMouseID[id] = { ...currentMouse, ...mouse };
      break;
    }
    case HomeActionTypes.DELETE_MOUSE: {
      const { id } = action.payload;
      draft.allMice = draft.allMice.filter((mouseID) => mouseID !== id);
      delete draft.byMouseID[id];
      break;
    }
  }
}, initialState);

export default HomeReducer;
